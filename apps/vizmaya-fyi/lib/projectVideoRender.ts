/**
 * Server-side: render a freeform video project as MP4.
 *
 * Imports `playwright` and shells out to `ffmpeg`, so this module can only run
 * in a Node runtime (Next.js API routes with `runtime = 'nodejs'`, scripts
 * under `tsx`). Do not import from a Client Component or an Edge route handler —
 * the API route dynamic-imports it lazily, exactly like `storyVideoRender.ts`.
 *
 * Unlike the story-video pipeline (which records the page in real time as the
 * walk scrolls), a project render uses DETERMINISTIC FRAME CAPTURE: the shell
 * exposes `window.__videoProject__.seek(ms)` and we step the playhead at a fixed
 * FPS, screenshotting each settled frame, then assemble the PNGs with ffmpeg.
 * This makes the output exact (no wall-clock pacing drift) and lets every clip's
 * <video> settle to its precise source frame before each shot.
 *
 * Caller responsibilities:
 *   - Pass a Supabase service-role client (RLS would block writes).
 *   - Provide a `baseUrl` reachable from the headless browser.
 *   - Ensure `ffmpeg` is on PATH and Playwright Chromium is installed.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'
import type { SupabaseClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { resolveAssetUrl } from '@vismay/viz-engine'
import {
  computeProjectHash,
  getCachedProjectRender,
  getVideoProject,
  projectVideoBucket,
  projectVideoStoragePath,
  recordProjectRender,
  type VideoProjectAspect,
} from '@vismay/content-source/videoProjects'
import {
  PROJECT_OUTPUT_SIZE,
  type VideoClip,
  type VideoProjectSnapshot,
  type VideoTrack,
} from '@vismay/viz-admin'

/** Capture frame rate — fixed, matches the assembly framerate. */
const FPS = 30

/**
 * Hard cap on total captured frames. A misconfigured project (e.g. a
 * multi-hour durationMs) would otherwise screenshot indefinitely. At 30fps this
 * is 5 minutes of footage — well past any sane project length.
 */
const MAX_FRAMES = 30 * 60 * 5

/* ─── ffmpeg + download helpers (copied from storyVideoRender.ts; not exported
 *     there, and kept small + local so this module stays self-contained) ──── */

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

async function muxToMp4(
  videoPath: string,
  audioPath: string | null,
  outPath: string,
  outputSize: { width: number; height: number },
): Promise<void> {
  // libx264 needs even dimensions; lanczos for sharp text on any rescale;
  // yuv420p for max compatibility with social platforms / QuickTime.
  const vfFilter = `scale=${outputSize.width}:${outputSize.height}:flags=lanczos,format=yuv420p`
  const args = ['-y', '-i', videoPath]
  // Silent renders (audioPath === null) carry no audio input: `-an` drops any
  // stream and we skip `-shortest`.
  if (audioPath) args.push('-i', audioPath)
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-vf', vfFilter)
  if (audioPath) args.push('-c:a', 'aac', '-b:a', '160k', '-shortest')
  else args.push('-an')
  args.push('-movflags', '+faststart', outPath)
  await runFfmpeg(args, 'mux')
}

/* ─── Audio mixdown ─────────────────────────────────────────────────────── */

/**
 * Build a single mixed audio track for the project's audio clips, or `null`
 * when the project has no audible audio. For each non-muted clip on a
 * `kind:'audio'` track we:
 *   1. download the source media (`resolveAssetUrl(clip.layer.src)`),
 *   2. `atrim` it to the clip's source window `[sourceInMs, +durationMs]`,
 *   3. `adelay` it to its timeline `startMs`,
 *   4. `amix` all the delayed clips together (normalize=0 so individual
 *      levels are preserved; a single clip skips the mix).
 *
 * MVP scope: only `kind:'audio'` tracks contribute sound (a video clip's own
 * audio is not pulled — the shell mutes/seeks the <video> for frame capture).
 */
async function buildProjectAudio(
  snapshot: VideoProjectSnapshot,
  workDir: string,
  log: (msg: string) => void,
): Promise<string | null> {
  const audioTrackIds = new Set(
    snapshot.tracks.filter((t: VideoTrack) => t.kind === 'audio' && !t.muted).map((t) => t.id),
  )

  // Audio-track clips, not per-clip muted (audio clips ignore `visible`). We
  // read `layer.src` off the opaque VizLayer (index-signature → unknown).
  interface AudioClipInput {
    clip: VideoClip
    src: string
  }
  const audioClips: AudioClipInput[] = snapshot.clips
    .filter((c) => audioTrackIds.has(c.trackId) && !c.muted)
    .map((c) => ({
      clip: c,
      src: typeof c.layer.src === 'string' ? (c.layer.src as string) : null,
    }))
    .filter((c): c is AudioClipInput => c.src !== null)

  if (audioClips.length === 0) return null

  log(`mixing ${audioClips.length} audio clip(s)`)

  // Download each source into the workdir; keep parallel arrays of input files
  // and their clips so the filtergraph can reference them by ffmpeg input index.
  const inputPaths: string[] = []
  for (let i = 0; i < audioClips.length; i++) {
    const ext = path.extname(new URL(resolveAssetUrl(audioClips[i].src), 'http://x').pathname) || '.bin'
    const local = path.join(workDir, `audio-src-${i}${ext}`)
    await downloadFile(resolveAssetUrl(audioClips[i].src), local)
    inputPaths.push(local)
  }

  // Build the filtergraph: per input, trim to the source window then delay to
  // the timeline start; finally mix (or pass through for a single clip).
  const filterParts: string[] = []
  const mixLabels: string[] = []
  for (let i = 0; i < audioClips.length; i++) {
    const { clip } = audioClips[i]
    const sourceInMs = clip.sourceInMs ?? 0
    const sourceOutMs = clip.sourceOutMs ?? sourceInMs + clip.durationMs
    const startSec = (sourceInMs / 1000).toFixed(3)
    const endSec = (sourceOutMs / 1000).toFixed(3)
    const delayMs = Math.max(0, Math.round(clip.startMs))
    const label = `a${i}`
    // atrim cuts the source window; asetpts=PTS-STARTPTS rebases timestamps to
    // zero so adelay's offset is measured from the clip head; adelay shifts the
    // whole clip to its timeline position (per-channel — `d|d` covers stereo).
    filterParts.push(
      `[${i}:a]atrim=start=${startSec}:end=${endSec},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}[${label}]`,
    )
    mixLabels.push(`[${label}]`)
  }

  const mixedPath = path.join(workDir, 'mixed.wav')
  const inputArgs: string[] = []
  for (const p of inputPaths) inputArgs.push('-i', p)

  let filterComplex: string
  if (audioClips.length === 1) {
    // Single clip: the trimmed+delayed stream IS the output.
    filterComplex = `${filterParts[0].replace('[a0]', '[aout]')}`
  } else {
    filterComplex = `${filterParts.join(';')};${mixLabels.join('')}amix=inputs=${audioClips.length}:normalize=0[aout]`
  }

  await runFfmpeg(
    [
      '-y',
      ...inputArgs,
      '-filter_complex',
      filterComplex,
      '-map',
      '[aout]',
      mixedPath,
    ],
    'audio-mix',
  )
  return mixedPath
}

/* ─── Deterministic frame capture ───────────────────────────────────────── */

interface CaptureResult {
  framesDir: string
  frameCount: number
  durationMs: number
}

/**
 * Walk the project's timeline in headless Chromium, screenshotting one PNG per
 * frame. The shell publishes `window.__videoProject__.seek(ms)` which sets the
 * playhead + settles every live <video> to its exact source frame and resolves
 * after the next paint — so each screenshot is a clean, deterministic frame.
 */
async function captureFrames(args: {
  projectId: string
  aspect: VideoProjectAspect
  durationMs: number
  baseUrl: string
  workDir: string
  log: (msg: string) => void
}): Promise<CaptureResult> {
  const output = PROJECT_OUTPUT_SIZE[args.aspect]
  const framesDir = path.join(args.workDir, 'frames')
  fs.mkdirSync(framesDir, { recursive: true })

  const browser = await chromium.launch({
    args: [
      // Project clips can be unmuted <video> elements; without this Chromium
      // refuses to start playback / decode the first frame on seek.
      '--autoplay-policy=no-user-gesture-required',
      '--disable-blink-features=AutomationControlled',
    ],
  })
  // Viewport === output: these are composited DOM layers (no mobile-layout
  // media query like the story page), so we render at output resolution and
  // screenshot 1:1 — no upscale needed. The mux still runs the scale/format
  // filter to guarantee even dims + yuv420p.
  const context = await browser.newContext({
    viewport: { width: output.w, height: output.h },
    deviceScaleFactor: 1,
    // Force animations on (some headless setups default to `reduce`, which
    // would skip the clip enter/exit ramps — though those are evaluated in JS
    // by resolveClipFrame, this keeps any CSS-driven layer animation honest).
    reducedMotion: 'no-preference',
  })
  const page = await context.newPage()

  try {
    const url = `${args.baseUrl}/video-project/${args.projectId}?capture=1`
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 })

    // Wait for the shell to mount + fonts + first paint.
    await page.waitForFunction(
      () => (window as unknown as { __projectReady__?: boolean }).__projectReady__ === true,
      { timeout: 60_000 },
    )

    // Read the authoritative duration from the live API (the shell exposes it),
    // falling back to the caller's value.
    const liveDuration = (await page
      .evaluate(
        () => (window as unknown as { __videoProject__?: { durationMs: number } }).__videoProject__?.durationMs,
      )
      .catch(() => undefined)) as number | undefined
    const durationMs = Math.max(1, Math.round(liveDuration ?? args.durationMs))

    const stepMs = 1000 / FPS
    // Frames spanning [0, durationMs): frame i is the playhead at i*stepMs.
    const totalFrames = Math.min(MAX_FRAMES, Math.max(1, Math.ceil(durationMs / stepMs)))
    if (totalFrames === MAX_FRAMES) {
      args.log(`⚠ capping at ${MAX_FRAMES} frames (durationMs ${durationMs} too large)`)
    }
    args.log(
      `capturing ${totalFrames} frame(s) @ ${FPS}fps · ${output.w}×${output.h} (${(durationMs / 1000).toFixed(1)}s)`,
    )

    for (let i = 0; i < totalFrames; i++) {
      // Clamp the last frame just inside the duration so a clip whose end ==
      // durationMs is still resolved as live (resolveClipFrame is end-exclusive).
      const ms = Math.min(i * stepMs, durationMs - 0.001)
      await page.evaluate(
        (t) => (window as unknown as { __videoProject__: { seek: (ms: number) => Promise<void> } }).__videoProject__.seek(t),
        ms,
      )
      const frameName = `frame-${String(i + 1).padStart(5, '0')}.png`
      await page.screenshot({ path: path.join(framesDir, frameName) })
      if ((i + 1) % FPS === 0 || i === totalFrames - 1) {
        args.log(`  frame ${i + 1}/${totalFrames}`)
      }
    }

    return { framesDir, frameCount: totalFrames, durationMs }
  } finally {
    await context.close()
    await browser.close()
  }
}

/* ─── Upload ────────────────────────────────────────────────────────────── */

async function uploadAndRecord(args: {
  supabase: SupabaseClient
  projectId: string
  aspect: VideoProjectAspect
  snapshotHash: string
  durationMs: number
  mp4Buffer: Buffer
}): Promise<string> {
  const bucket = projectVideoBucket()
  const storagePath = projectVideoStoragePath(args.projectId, args.aspect, args.snapshotHash)

  const { error: uploadErr } = await args.supabase.storage
    .from(bucket)
    .upload(storagePath, args.mp4Buffer, {
      contentType: 'video/mp4',
      upsert: true,
    })
  if (uploadErr) throw new Error(`upload: ${uploadErr.message}`)

  const { data } = args.supabase.storage.from(bucket).getPublicUrl(storagePath)
  const publicUrl = data.publicUrl

  await recordProjectRender(args.supabase, {
    projectId: args.projectId,
    aspect: args.aspect,
    snapshotHash: args.snapshotHash,
    storagePath,
    publicUrl,
    durationMs: args.durationMs,
  })

  return publicUrl
}

/* ─── Public entry point ────────────────────────────────────────────────── */

export interface ProjectRenderResult {
  public_url: string
  cached: boolean
  duration_ms: number
}

export async function renderProjectVideo(args: {
  supabase: SupabaseClient
  projectId: string
  aspect: VideoProjectAspect
  baseUrl: string
  force?: boolean
  log?: (msg: string) => void
}): Promise<ProjectRenderResult> {
  const log = args.log ?? (() => {})

  // Load the project + parse its opaque snapshot (stored as JSON in `config`).
  const project = await getVideoProject(args.projectId)
  if (!project) throw new Error(`video project ${args.projectId} not found`)
  const snapshot = project.config as VideoProjectSnapshot
  if (!snapshot || snapshot.version !== 1) {
    throw new Error(`video project ${args.projectId} has no valid snapshot`)
  }

  const hash = computeProjectHash(project.config, args.aspect)

  if (!args.force) {
    const existing = await getCachedProjectRender(
      args.supabase,
      args.projectId,
      args.aspect,
      hash,
    )
    if (existing && existing.public_url && existing.snapshot_hash === hash) {
      log(`cached (hash match) → ${existing.public_url}`)
      return {
        public_url: existing.public_url,
        cached: true,
        duration_ms: existing.duration_ms ?? snapshot.durationMs,
      }
    }
  }

  const workDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `vizmaya-project-${args.projectId}-`),
  )
  log(`workdir: ${workDir}`)

  try {
    // 1. Audio mixdown (null when the project has no audible audio clips).
    const audioPath = await buildProjectAudio(snapshot, workDir, log)

    // 2. Deterministic frame capture.
    const { framesDir, frameCount, durationMs } = await captureFrames({
      projectId: args.projectId,
      aspect: args.aspect,
      durationMs: snapshot.durationMs,
      baseUrl: args.baseUrl,
      workDir,
      log,
    })

    // 3. Assemble PNGs → silent H264 video. We encode here, then a second pass
    //    muxes audio over it — keeps each step simple and the audio offsets
    //    intact (the frame video already starts at t=0, as does the mix).
    const output = PROJECT_OUTPUT_SIZE[args.aspect]
    const silentPath = path.join(workDir, 'silent.mp4')
    log(`assembling ${frameCount} frame(s) → silent video`)
    await runFfmpeg(
      [
        '-y',
        '-framerate',
        String(FPS),
        '-i',
        path.join(framesDir, 'frame-%05d.png'),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-vf',
        `scale=${output.w}:${output.h}:flags=lanczos`,
        '-r',
        String(FPS),
        silentPath,
      ],
      'assemble',
    )

    // 4. Mux audio (or pass through silent). muxToMp4 handles the null-audio
    //    case (-an, no -shortest) and re-stamps yuv420p/+faststart.
    const outPath = path.join(workDir, 'out.mp4')
    log(audioPath ? 'muxing video + audio' : 'finalizing silent video')
    await muxToMp4(silentPath, audioPath, outPath, { width: output.w, height: output.h })

    const mp4Buffer = fs.readFileSync(outPath)
    log(`uploading ${(mp4Buffer.length / 1024 / 1024).toFixed(1)}MB to ${projectVideoBucket()}`)
    const publicUrl = await uploadAndRecord({
      supabase: args.supabase,
      projectId: args.projectId,
      aspect: args.aspect,
      snapshotHash: hash,
      durationMs,
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
