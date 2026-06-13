/**
 * Server-side: render an autoplay session as MP4.
 *
 * Imports `playwright` and shells out to `ffmpeg`, so this module can only
 * run in a Node runtime (Next.js API routes with `runtime = 'nodejs'`,
 * scripts under `tsx`). Do not import from a Client Component or an Edge
 * route handler.
 *
 * Caller responsibilities:
 *   - Pass a Supabase service-role client (RLS would block writes).
 *   - Provide a `baseUrl` reachable from the headless browser
 *     (e.g. `http://localhost:3000` in dev).
 *   - Ensure `ffmpeg` is on PATH and Playwright Chromium is installed
 *     (`npx playwright install chromium`).
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'
import type { SupabaseClient } from '@supabase/supabase-js'
import { chromium, type Frame } from 'playwright'
import {
  computeAudioRevisionHash,
  computeTimeline,
  getCachedVideo,
  loadChunksAndCues,
  upsertStoryVideoRow,
  videoStoragePath,
  type VideoAspect,
  type VideoRange,
} from '@vismay/content-source/storyVideo'
import { buildSilentTimeline } from '@vismay/content-source/silentTimeline'

interface CueRow {
  unit_index: number
  chunk_index: number
  start_ms: number
  end_ms: number
}

interface ChunkRow {
  chunk_index: number
  public_url: string
  duration_ms: number
}

/**
 * Per-aspect render config.
 *
 * - `viewport` is what the page sees in CSS pixels. It controls layout —
 *   text size, paddings, breakpoints — and decides which side of the
 *   `(max-aspect-ratio: 1/1)` media query the page lands on (mobile vs
 *   desktop layout, see lib/chartTheme.ts:69). Playwright's `recordVideo`
 *   captures the page at viewport size (its `size` option does not upscale
 *   — it pads with empty space), so this is also the recording resolution.
 * - `output` is the final MP4's pixel dimensions. If `output != viewport`,
 *   the mux step upscales with ffmpeg's lanczos scaler.
 *
 * 9:16 uses a mobile-sized viewport (473×840) so text and chrome are sized
 * for a phone, then ffmpeg upscales to 1080×1920 for shareable HD output —
 * at viewport=1080×1920 the page would lay out with desktop-scale type
 * inside a tall frame and text would look tiny. 16:9 keeps viewport ==
 * output (1920×1080) since the desktop layout is already calibrated for HD.
 */
const RENDER_CONFIG: Record<
  VideoAspect,
  {
    viewport: { width: number; height: number }
    output: { width: number; height: number }
  }
> = {
  '9:16': {
    viewport: { width: 646, height: 1136 }, // 646/1136 ≈ 0.5687, ~9:16
    output: { width: 1080, height: 1920 },
  },
  '16:9': {
    viewport: { width: 1920, height: 1080 },
    output: { width: 1920, height: 1080 },
  },
}

const VIDEO_BUCKET = 'story-video'

/* ─── ffmpeg + download helpers ─────────────────────────────────────── */

function runFfmpeg(args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('error', (err) => reject(new Error(`${label}: ${err.message}`)))
    proc.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${label} exited ${code}\n${stderr.slice(-2000)}`))
    })
  })
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download ${url}: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(destPath, buf)
}

async function buildCombinedAudio(
  chunks: ChunkRow[],
  workDir: string
): Promise<string> {
  const ordered = [...chunks].sort((a, b) => a.chunk_index - b.chunk_index)

  const localPaths: string[] = []
  for (const chunk of ordered) {
    const local = path.join(workDir, `chunk-${chunk.chunk_index}.wav`)
    await downloadFile(chunk.public_url, local)
    localPaths.push(local)
  }

  if (localPaths.length === 1) return localPaths[0]

  // ffmpeg concat demuxer — bit-exact concatenation, no re-encoding. The
  // generator writes WAVs with identical format (mono / 24kHz / 16-bit), so
  // `-c copy` is safe.
  const listPath = path.join(workDir, 'concat.txt')
  fs.writeFileSync(
    listPath,
    localPaths.map((p) => `file '${p.replace(/'/g, `'\\''`)}'`).join('\n')
  )
  const combinedPath = path.join(workDir, 'combined.wav')
  await runFfmpeg(
    ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', combinedPath],
    'concat'
  )
  return combinedPath
}

/* ─── Headless walk ─────────────────────────────────────────────────── */

interface PlaywrightRenderResult {
  videoPath: string
  durationMs: number
}

/**
 * Walk the cue list in headless Chromium, recording the page as WebM. The
 * scroll logic mirrors AutoplayShell.scrollIframeToUnit:261-271 — same
 * `[data-unit-index="<n>"]` selector, same smooth scrollIntoView. Hold time
 * per unit equals (end_ms - start_ms) so the recorded footage shares the
 * same timeline as the audio.
 *
 * A `range` of `{ startMs, endMs }` over the cumulative audio timeline lets
 * callers render a sub-clip. Cues outside the window are skipped; the first
 * in-range cue's unit is scrolled into view *before* recording starts (so the
 * MP4 opens on the right frame), and the final hold clamps to range.endMs.
 */
async function walkAndRecord(args: {
  slug: string
  aspect: VideoAspect
  baseUrl: string
  workDir: string
  chunks: ChunkRow[]
  cues: CueRow[]
  /** Cumulative-timeline window to render. */
  range: VideoRange
}): Promise<PlaywrightRenderResult> {
  const cfg = RENDER_CONFIG[args.aspect]

  // Sort cues by playback order (chunk_index then start_ms). Within a chunk,
  // start_ms order equals unit_index order; across chunks, chunk_index orders
  // them. This matches how the autoplay player advances.
  const ordered = [...args.cues].sort(
    (a, b) =>
      a.chunk_index - b.chunk_index ||
      a.start_ms - b.start_ms ||
      a.unit_index - b.unit_index
  )

  // Absolute end time per cue, measured in ms from the walk's t=0. Cues
  // partition each chunk's duration and chunks play back-to-back, so cue C's
  // target end-time = (sum of chunk durations before C's chunk) + cue.end_ms.
  //
  // We use absolute targets — instead of summing per-cue waitForTimeout calls
  // — so that scroll-evaluate latency doesn't compound. On a Mapbox-heavy
  // page each evaluate can stall the JS thread for a few seconds; with the
  // additive approach the walk overruns audio total and the `-shortest` mux
  // crops the last chunk of footage. With absolute targets, a slow scroll
  // shortens that cue's hold instead of pushing the whole timeline back.
  const { chunkOffsetMs, totalMs: totalAudioMs } = computeTimeline(args.chunks)

  // Clamp range to actual audio bounds (route layer also validates, but be
  // defensive — a 100ms overshoot caused by audio re-render shouldn't crash).
  const rangeStart = Math.max(0, Math.min(args.range.startMs, totalAudioMs))
  const rangeEnd = Math.max(rangeStart + 1, Math.min(args.range.endMs, totalAudioMs))
  const targetWalkMs = rangeEnd - rangeStart
  const isSubRange = !(rangeStart === 0 && rangeEnd === totalAudioMs)

  // Cues whose [absStart, absEnd) intersects the window — i.e. anything we
  // need to scroll to during the recording.
  const inRange = ordered.filter((c) => {
    const absStart = (chunkOffsetMs.get(c.chunk_index) ?? 0) + c.start_ms
    const absEnd = (chunkOffsetMs.get(c.chunk_index) ?? 0) + c.end_ms
    return absEnd > rangeStart && absStart < rangeEnd
  })

  const browser = await chromium.launch({
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--disable-blink-features=AutomationControlled',
      // Headless Chromium has smooth-scrolling off by default — without this
      // flag, `scrollIntoView({ behavior: 'smooth' })` silently teleports.
      '--enable-smooth-scrolling',
    ],
  })
  const context = await browser.newContext({
    viewport: cfg.viewport,
    deviceScaleFactor: 1,
    // recordVideo.size must match viewport — Playwright doesn't upscale,
    // it just pads the captured frames with empty space.
    recordVideo: { dir: args.workDir, size: cfg.viewport },
    // Force `prefers-reduced-motion: no-preference` so the page's animations
    // — chart entrances, GSAP transitions, smooth scroll — actually run.
    // Some CI / headless setups default to `reduce`, which makes everything
    // teleport and ruins the recording.
    reducedMotion: 'no-preference',
  })

  // Capture every Mapbox map instance the page creates, so the walk loop
  // can wait for camera transitions to settle before advancing. Without
  // this, the next cue's scroll fires while the previous map is still
  // panning + tile-loading, and the recording shows visible tile pop-in.
  await context.addInitScript(() => {
    interface MapStub {
      loaded(): boolean
      once(event: string, fn: () => void): void
    }
    interface CaptureWindow extends Window {
      __capturedMaps__?: MapStub[]
      __mapboxgl_proxy__?: { Map?: unknown }
    }
    const win = window as unknown as CaptureWindow
    win.__capturedMaps__ = []
    let originalMap: (new (...args: unknown[]) => MapStub) | null = null
    Object.defineProperty(win, 'mapboxgl', {
      configurable: true,
      get() {
        return win.__mapboxgl_proxy__
      },
      set(v: { Map?: unknown }) {
        win.__mapboxgl_proxy__ = v
        if (v && v.Map && !originalMap) {
          originalMap = v.Map as new (...args: unknown[]) => MapStub
          const proxy = function (...args: unknown[]) {
            const inst = new (originalMap as new (
              ...args: unknown[]
            ) => MapStub)(...args)
            win.__capturedMaps__!.push(inst)
            return inst
          } as unknown as new (...args: unknown[]) => MapStub
          proxy.prototype = originalMap.prototype
          Object.assign(proxy, originalMap)
          v.Map = proxy
        }
      },
    })
  })

  const contextStartMs = Date.now()
  const page = await context.newPage()

  // ?autoplay=1 strips chrome and applies the autoplay-flavored layout.
  // ?capture=1 sets staticCapture in StoryShell so the map jumps
  // deterministically between cues instead of flying — keeps tile loads
  // off-frame and makes camera state predictable from cue timing alone.
  // ?compose=vertical (9:16 only) constrains the story content to a 4:5
  // central band and fills the surrounding 9:16 frame with the story's
  // aura background — see components/story/VerticalCaptureFrame.tsx.
  // Aspect itself is determined by viewport via the `(max-aspect-ratio:
  // 1/1)` media query (lib/chartTheme.ts:69).
  const composeParam = args.aspect === '9:16' ? '&compose=vertical' : ''
  const url = `${args.baseUrl}/story/${args.slug}?autoplay=1&capture=1${composeParam}`
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 })

  // In 9:16 compose mode the actual story content is rendered inside an
  // iframe (components/story/VerticalCaptureFrame.tsx) so its layout
  // responds to a 4:5 viewport — `h-svh` sections resolve to the inner
  // height instead of overflowing the YouTube-Shorts safe zone. The story
  // page selectors, the Mapbox-proxy state, and the scroll target all live
  // in that iframe, so we resolve a Frame handle here and drive everything
  // through it. 16:9 keeps using the page's main frame as before.
  let walkFrame: Frame = page.mainFrame()
  if (args.aspect === '9:16') {
    await page.waitForSelector('iframe[data-vcf-inner]', { timeout: 30_000 })
    const handle = await page.$('iframe[data-vcf-inner]')
    const inner = await handle?.contentFrame()
    if (!inner) throw new Error('vertical capture iframe never produced a contentFrame')
    walkFrame = inner
  }

  await walkFrame.waitForSelector('[data-unit-index]', { timeout: 30_000 })
  try {
    await page.waitForLoadState('networkidle', { timeout: 15_000 })
  } catch {
    // Some pages keep websockets open; networkidle never resolves. Continue.
  }

  // Wait for Mapbox maps to finish their first load before starting the walk.
  // Without this the first cue's tiles pop in on camera, which is the most
  // visible artifact in the final video. The intro time before walkStartMs is
  // trimmed by ffmpeg below, so waiting longer here doesn't desync audio — it
  // only adds wall-clock to the render.
  //
  // Two-phase poll: (1) wait briefly for any map to be captured by the proxy
  // — if the page has no maps we don't want to hang; (2) wait for every
  // captured map to report `loaded()`. Both phases swallow timeouts so a
  // stuck map can't block the render; the per-cue idle wait further down
  // handles late-arriving maps and post-pan tile loads.
  //
  // `addInitScript` runs in every frame in the context, so the iframe's
  // window has its own `__capturedMaps__` array populated by the story
  // page running inside it.
  //
  // Fast path for map-less stories (deck-format slides, text-only stories):
  // the shell publishes `__expectedMapCount__` synchronously, computed from
  // the SAME slot resolver that decides whether a Mapbox instance mounts. When
  // it's a definite 0, no map will ever register, so we skip the proxy probe
  // entirely instead of letting phase 1's 5s timeout elapse on every render. A
  // null/undefined reading (older page, or a race before the shell effect ran)
  // falls through to the probe, preserving the original behavior.
  const expectedMapCount = (await walkFrame
    .evaluate(
      () =>
        (window as unknown as { __expectedMapCount__?: number })
          .__expectedMapCount__
    )
    .catch(() => undefined)) as number | undefined

  if (expectedMapCount !== 0) {
    try {
      await walkFrame.waitForFunction(
        () => {
          const w = window as unknown as {
            __capturedMaps__?: { loaded(): boolean }[]
          }
          return !!w.__capturedMaps__ && w.__capturedMaps__.length > 0
        },
        { timeout: 5_000 }
      )
      await walkFrame.waitForFunction(
        () => {
          const w = window as unknown as {
            __capturedMaps__?: { loaded(): boolean }[]
          }
          const maps = w.__capturedMaps__!
          return maps.every((m) => m.loaded())
        },
        { timeout: 30_000 }
      )
    } catch {
      // Either no maps appeared, or they didn't settle in time.
    }
  }

  // One extra beat for any GSAP/chart entrance animations to settle, plus
  // tile rendering after `loaded()` flips true.
  await page.waitForTimeout(800)

  // For sub-range renders, jump the first in-range unit into view *without*
  // smooth scrolling before declaring walkStartMs. The recording is still
  // active (Playwright can't pause its recorder), but everything before
  // walkStartMs is trimmed by ffmpeg below — so the trimmed MP4 opens on
  // the right frame instead of partway through a smooth scroll from the
  // top of the page.
  if (isSubRange && inRange.length > 0) {
    await walkFrame.evaluate((idx) => {
      const el = document.querySelector(
        `[data-unit-index="${idx}"]`
      ) as HTMLElement | null
      if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' })
    }, inRange[0].unit_index)
    // Brief settle for any map camera + chart transitions that re-fire on
    // scroll. Same beat as the post-load wait above.
    await page.waitForTimeout(800)
  }

  const walkStartMs = Date.now()

  for (const cue of inRange) {
    const offset = chunkOffsetMs.get(cue.chunk_index) ?? 0
    const cueEndAbs = offset + cue.end_ms

    await walkFrame.evaluate((idx) => {
      const el = document.querySelector(
        `[data-unit-index="${idx}"]`
      ) as HTMLElement | null
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, cue.unit_index)

    // Translate the absolute cue-end into wall-clock relative to walkStart,
    // by subtracting the range's start offset. Clamp to the window end so
    // the last cue stops on schedule even when its absEnd extends past it.
    const cueEndInWindow = Math.min(cueEndAbs, rangeEnd) - rangeStart
    const targetWallMs = walkStartMs + cueEndInWindow

    // Wait for any active Mapbox camera transition to settle before
    // counting hold time, but cap at the smaller of 1.5s and the remaining
    // hold budget. Capping matters: the absolute-clock pacing is what keeps
    // the walk locked to audio duration, and a stuck `idle` event would
    // otherwise stall the timeline.
    const idleCapMs = Math.min(
      1500,
      Math.max(0, targetWallMs - Date.now())
    )
    if (idleCapMs > 0) {
      await Promise.race([
        walkFrame
          .waitForFunction(
            () => {
              const w = window as unknown as {
                __capturedMaps__?: { loaded(): boolean }[]
              }
              const maps = w.__capturedMaps__
              if (!maps || maps.length === 0) return true
              return maps.every((m) => m.loaded())
            },
            { timeout: idleCapMs }
          )
          .catch(() => {
            /* timed out waiting for idle — fall through */
          }),
        page.waitForTimeout(idleCapMs),
      ])
    }

    const remaining = Math.max(0, targetWallMs - Date.now())
    if (remaining > 0) await page.waitForTimeout(remaining)
  }

  // Hold the final frame until the absolute audio end (or preview cap).
  // If we got here ahead of schedule (rare, but possible on a fast machine),
  // waitForTimeout pads out so the trim window matches the target duration.
  const walkEndAbsMs = walkStartMs + targetWalkMs
  const tailRemaining = Math.max(0, walkEndAbsMs - Date.now())
  if (tailRemaining > 0) await page.waitForTimeout(tailRemaining)

  const walkEndMs = Date.now()
  const offsetSec = (walkStartMs - contextStartMs) / 1000
  const walkSec = (walkEndMs - walkStartMs) / 1000

  // Closing the context finalizes the recorded video file on disk.
  const video = page.video()
  await context.close()
  await browser.close()
  if (!video) throw new Error('playwright did not record a video')
  const rawVideoPath = await video.path()

  // Trim away the page-load + networkidle "intro" so video and audio start
  // together. We can't pause Playwright's recorder mid-context, hence the trim.
  const trimmedPath = path.join(args.workDir, 'trimmed.webm')
  await runFfmpeg(
    [
      '-y',
      '-ss', offsetSec.toFixed(3),
      '-i', rawVideoPath,
      '-t', walkSec.toFixed(3),
      '-c', 'copy',
      trimmedPath,
    ],
    'trim'
  )

  return { videoPath: trimmedPath, durationMs: Math.round(walkSec * 1000) }
}

async function muxToMp4(
  videoPath: string,
  audioPath: string | null,
  outPath: string,
  outputSize: { width: number; height: number }
): Promise<void> {
  // libx264 needs even dimensions; lanczos for sharp text on upscale; yuv420p
  // for max compatibility with social platforms / QuickTime.
  const vfFilter = `scale=${outputSize.width}:${outputSize.height}:flags=lanczos,format=yuv420p`
  const args = ['-y', '-i', videoPath]
  // Silent renders (audioPath === null) carry no audio input: `-an` drops any
  // stream and we skip `-shortest` (no second stream to bound against — the
  // trimmed WebM already runs exactly the target duration).
  if (audioPath) args.push('-i', audioPath)
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-vf', vfFilter)
  if (audioPath) args.push('-c:a', 'aac', '-b:a', '160k', '-shortest')
  else args.push('-an')
  args.push('-movflags', '+faststart', outPath)
  await runFfmpeg(args, 'mux')
}

/* ─── Upload ────────────────────────────────────────────────────────── */

async function uploadAndRecord(args: {
  supabase: SupabaseClient
  slug: string
  aspect: VideoAspect
  range: VideoRange
  totalAudioMs: number
  audioRevisionHash: string
  durationMs: number
  narration: boolean
  mp4Buffer: Buffer
}): Promise<string> {
  const storagePath = videoStoragePath(
    args.slug,
    args.aspect,
    args.range,
    args.totalAudioMs,
    args.narration
  )

  const { error: uploadErr } = await args.supabase.storage
    .from(VIDEO_BUCKET)
    .upload(storagePath, args.mp4Buffer, {
      contentType: 'video/mp4',
      upsert: true,
    })
  if (uploadErr) throw new Error(`upload: ${uploadErr.message}`)

  const { data } = args.supabase.storage.from(VIDEO_BUCKET).getPublicUrl(storagePath)
  const publicUrl = data.publicUrl

  const { error: dbErr } = await upsertStoryVideoRow(args.supabase, {
    slug: args.slug,
    aspect: args.aspect,
    range_start_ms: args.range.startMs,
    range_end_ms: args.range.endMs,
    narration: args.narration,
    storage_path: storagePath,
    public_url: publicUrl,
    audio_revision_hash: args.audioRevisionHash,
    duration_ms: args.durationMs,
    // Clear the in-flight stub timestamp set by markDispatched(). The
    // classifyVideoState() check would prefer `public_url` regardless,
    // but nulling this keeps the row's state unambiguous in DB readers.
    dispatched_at: null,
  })
  if (dbErr) throw new Error(`db upsert: ${dbErr.message}`)

  return publicUrl
}

/* ─── Public entry point ────────────────────────────────────────────── */

export interface RenderResult {
  public_url: string
  cached: boolean
  duration_ms: number | null
}

export async function renderStoryVideo(args: {
  supabase: SupabaseClient
  slug: string
  aspect: VideoAspect
  baseUrl: string
  force?: boolean
  /**
   * Cumulative-timeline window to render. Omit for a full render — the
   * function resolves it to `{ startMs: 0, endMs: totalAudioMs }` after
   * loading the chunks.
   */
  range?: VideoRange
  /**
   * When `false`, render a silent video with no narration: pacing comes from
   * the per-unit dwell times in `<slug>.timing.yaml` (a synthesized timeline)
   * instead of the TTS audio cues, and the MP4 carries no audio track.
   * Defaults to `true` (the narrated pipeline).
   */
  narration?: boolean
  log?: (msg: string) => void
}): Promise<RenderResult> {
  const log = args.log ?? (() => {})
  const narration = args.narration !== false

  // Two timeline sources share the same `{ chunks, cues, totalMs, hash }`
  // shape downstream: narrated reads the TTS audio tables, silent synthesizes
  // a timeline from per-unit dwell config. `chunks` only feeds the walk's
  // pacing (durations) for the silent path — its `public_url` is unused.
  const { chunks, cues, totalAudioMs, audioRevisionHash } = narration
    ? await (async () => {
        const loaded = await loadChunksAndCues(args.supabase, args.slug)
        if (loaded.chunks.length === 0 || loaded.cues.length === 0) {
          throw new Error(
            `no audio chunks/cues for ${args.slug} — generate audio first via npx tsx scripts/generate-audio.ts`
          )
        }
        return {
          chunks: loaded.chunks,
          cues: loaded.cues,
          totalAudioMs: computeTimeline(loaded.chunks).totalMs,
          audioRevisionHash: computeAudioRevisionHash(loaded.chunks, loaded.cues),
        }
      })()
    : await (async () => {
        const silent = await buildSilentTimeline(args.slug)
        if (silent.totalMs === 0) {
          throw new Error(
            `no mobile units for ${args.slug} — nothing to render a silent video from`
          )
        }
        return {
          chunks: silent.chunks,
          cues: silent.cues,
          totalAudioMs: silent.totalMs,
          audioRevisionHash: silent.revisionHash,
        }
      })()

  const range: VideoRange = args.range ?? { startMs: 0, endMs: totalAudioMs }
  const isSubRange = !(range.startMs === 0 && range.endMs === totalAudioMs)

  if (!args.force) {
    const existing = await getCachedVideo(args.supabase, args.slug, args.aspect, range, narration)
    if (existing && existing.audio_revision_hash === audioRevisionHash) {
      log(`cached (hash match) → ${existing.public_url}`)
      return {
        public_url: existing.public_url,
        cached: true,
        duration_ms: existing.duration_ms,
      }
    }
  }

  const workDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `vizmaya-video-${args.slug}-`)
  )
  log(`workdir: ${workDir}`)

  try {
    // Silent renders skip audio entirely — no chunks to download, no track to
    // mux. `combinedAudioPath` stays null and threads through to a video-only
    // mux below.
    let combinedAudioPath: string | null = null
    if (narration) {
      log(`downloading + concatenating ${chunks.length} audio chunk(s)`)
      combinedAudioPath = await buildCombinedAudio(chunks, workDir)
    } else {
      log(`silent render — pacing from timing config (no audio)`)
    }

    const cfg = RENDER_CONFIG[args.aspect]
    const rangeLabel = isSubRange
      ? ` [range ${range.startMs}–${range.endMs}ms of ${totalAudioMs}ms]`
      : ''
    log(
      `rendering ${cues.length} cue(s)${rangeLabel}: viewport ${cfg.viewport.width}×${cfg.viewport.height} → output ${cfg.output.width}×${cfg.output.height} (lanczos upscale)`
    )
    const { videoPath, durationMs } = await walkAndRecord({
      slug: args.slug,
      aspect: args.aspect,
      baseUrl: args.baseUrl,
      workDir,
      chunks,
      cues,
      range,
    })

    // For sub-range renders, crop the combined audio to the requested
    // window before mux so the MP4's audio is the synced TTS for exactly
    // [startMs, endMs]. `-shortest` would chop one stream or the other to
    // match anyway, but an explicit crop avoids surprise silence padding.
    // Silent renders have no audio to crop — muxAudioPath stays null.
    let muxAudioPath = combinedAudioPath
    if (isSubRange && combinedAudioPath) {
      muxAudioPath = path.join(workDir, 'audio-range.wav')
      await runFfmpeg(
        [
          '-y',
          '-ss', (range.startMs / 1000).toFixed(3),
          '-i', combinedAudioPath,
          '-t', ((range.endMs - range.startMs) / 1000).toFixed(3),
          '-c', 'copy',
          muxAudioPath,
        ],
        'audio-crop'
      )
    }

    log(
      `muxing ${narration ? 'video + audio' : 'video (silent)'} (${(durationMs / 1000).toFixed(1)}s)`
    )
    const outPath = path.join(workDir, 'out.mp4')
    await muxToMp4(videoPath, muxAudioPath, outPath, cfg.output)

    const mp4Buffer = fs.readFileSync(outPath)
    log(`uploading ${(mp4Buffer.length / 1024 / 1024).toFixed(1)}MB to ${VIDEO_BUCKET}`)
    const publicUrl = await uploadAndRecord({
      supabase: args.supabase,
      slug: args.slug,
      aspect: args.aspect,
      range,
      totalAudioMs,
      audioRevisionHash,
      durationMs,
      narration,
      mp4Buffer,
    })

    log(`✓ ${publicUrl}`)
    return { public_url: publicUrl, cached: false, duration_ms: durationMs }
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}
