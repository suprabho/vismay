import { NextResponse } from 'next/server'
import { createServiceClient } from '@vismay/content-source/supabase'
import {
  classifyVideoState,
  computeAudioRevisionHash,
  computeTimeline,
  getCachedVideo,
  loadChunksAndCues,
  markDispatched,
  type VideoAspect,
  type VideoRange,
} from '@vismay/content-source/storyVideo'
import {
  dispatchRenderJob,
  isDispatchConfigured,
} from '@/lib/storyVideoDispatch'
import { renderStoryVideo } from '@/lib/storyVideoRender'

/**
 * Two render paths share this route:
 *
 *  - **Local dev** (no `GITHUB_DISPATCH_TOKEN`): we shell out to Playwright
 *    + ffmpeg synchronously inside the request. Works on a Mac with the
 *    binaries on PATH; the request can take several minutes.
 *  - **Production** (token + repo configured): we fire a `workflow_dispatch`
 *    to GitHub Actions and return 202. The runner there does the render and
 *    uploads the MP4 to the same Supabase bucket. Callers poll this endpoint
 *    until the cache lookup returns a row.
 *
 * In-flight tracking lives in the `story_videos.dispatched_at` column. A
 * stub row is written at dispatch time so subsequent polls return 202
 * without re-dispatching. Without this guard, one click stacks dozens of
 * concurrent workflow runs because every 15s poll sees a cache miss.
 */
export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

function isAspect(v: string | null): v is VideoAspect {
  return v === '9:16' || v === '16:9'
}

function parseIntParam(v: string | null): number | undefined {
  if (v === null || v === '') return undefined
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return undefined
  return Math.floor(n)
}

/**
 * GET /api/story-video/[slug]?aspect=9:16|16:9
 *   [&force=1]                       bypass cache
 *   [&preview=1]                     legacy alias for startMs=0&endMs=20000
 *   [&startMs=N&endMs=N]             render a sub-clip of the cumulative
 *                                     audio timeline (ms). Omit both for the
 *                                     full render. Validated against totalMs.
 *
 * Responses:
 *   200 { status: 'ready', public_url, cached, duration_ms }
 *   202 { status: 'rendering' }     dispatch fired (or already in flight)
 *   400 { error }                   bad slug, aspect, or range
 *   404 { error }                   no audio for slug
 *   500 { error }                   render or dispatch failed
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) {
    return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  }

  const url = new URL(req.url)
  const aspect = url.searchParams.get('aspect')
  if (!isAspect(aspect)) {
    return NextResponse.json(
      { error: 'aspect must be 9:16 or 16:9' },
      { status: 400 }
    )
  }
  const force = url.searchParams.get('force') === '1'
  const previewLegacy = url.searchParams.get('preview') === '1'
  const startMsParam = parseIntParam(url.searchParams.get('startMs'))
  const endMsParam = parseIntParam(url.searchParams.get('endMs'))

  // The headless browser fetches `/story/<slug>?autoplay=1` from this same
  // app — derive the base URL from the incoming request so it works in dev,
  // preview, and production without env-var plumbing.
  const baseUrl = `${url.protocol}//${url.host}`

  const supabase = createServiceClient()

  let hash: string
  let totalMs: number
  try {
    const { chunks, cues } = await loadChunksAndCues(supabase, slug)
    if (chunks.length === 0 || cues.length === 0) {
      return NextResponse.json({ error: 'no audio for slug' }, { status: 404 })
    }
    hash = computeAudioRevisionHash(chunks, cues)
    totalMs = computeTimeline(chunks).totalMs
  } catch (err) {
    const message = err instanceof Error ? err.message : 'audio lookup failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // Resolve the requested range. Priority:
  //   1. explicit startMs/endMs
  //   2. legacy preview=1 → [0, 20000]
  //   3. no params → full render [0, totalMs]
  let range: VideoRange
  if (startMsParam !== undefined || endMsParam !== undefined) {
    const startMs = startMsParam ?? 0
    const endMs = endMsParam ?? totalMs
    if (endMs <= startMs) {
      return NextResponse.json(
        { error: 'endMs must be greater than startMs' },
        { status: 400 }
      )
    }
    if (endMs > totalMs) {
      return NextResponse.json(
        { error: `endMs ${endMs} exceeds totalMs ${totalMs}` },
        { status: 400 }
      )
    }
    range = { startMs, endMs }
  } else if (previewLegacy) {
    range = { startMs: 0, endMs: Math.min(20_000, totalMs) }
  } else {
    range = { startMs: 0, endMs: totalMs }
  }

  // Inspect the existing row (if any) and decide what to do.
  if (!force) {
    const row = await getCachedVideo(supabase, slug, aspect, range)
    const state = classifyVideoState(row, hash)
    if (state.kind === 'ready') {
      return NextResponse.json({
        status: 'ready',
        public_url: state.row.public_url,
        cached: true,
        duration_ms: state.row.duration_ms,
      })
    }
    if (state.kind === 'rendering') {
      // A workflow is already in flight for this (slug, aspect, range, hash).
      // The 202 keeps the client polling, but we don't fire another dispatch.
      return NextResponse.json({ status: 'rendering' }, { status: 202 })
    }
    // 'stale' falls through to a fresh dispatch; 'missing' too.
  }

  // The workflow always renders explicitly, so pass the range. For full
  // renders, range = { 0, totalMs }; the dispatch payload conveys it
  // verbatim and the runner reproduces the same cache key.
  const dispatchRange =
    range.startMs === 0 && range.endMs === totalMs ? undefined : range

  // Async path: hand the work to GitHub Actions.
  if (isDispatchConfigured()) {
    try {
      await markDispatched(supabase, {
        slug,
        aspect,
        audioRevisionHash: hash,
        range,
        totalMs,
      })
      await dispatchRenderJob({ slug, aspect, baseUrl, range: dispatchRange })
      return NextResponse.json({ status: 'rendering' }, { status: 202 })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'dispatch failed'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // Sync path: only viable on a host with Playwright + ffmpeg available.
  try {
    const result = await renderStoryVideo({
      supabase,
      slug,
      aspect,
      baseUrl,
      force,
      range,
    })
    return NextResponse.json({ status: 'ready', ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'render failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
