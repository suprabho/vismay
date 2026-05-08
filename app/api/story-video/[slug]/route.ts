import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  classifyVideoState,
  computeAudioRevisionHash,
  getCachedVideo,
  loadChunksAndCues,
  markDispatched,
  type VideoAspect,
} from '@/lib/storyVideo'
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

/**
 * GET /api/story-video/[slug]?aspect=9:16|16:9[&force=1]
 *
 * Responses:
 *   200 { status: 'ready', public_url, cached, duration_ms }
 *   202 { status: 'rendering' }     dispatch fired (or already in flight)
 *   400 { error }                   bad slug or aspect
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

  // The headless browser fetches `/story/<slug>?autoplay=1` from this same
  // app — derive the base URL from the incoming request so it works in dev,
  // preview, and production without env-var plumbing.
  const baseUrl = `${url.protocol}//${url.host}`

  const supabase = createServiceClient()

  let hash: string
  try {
    const { chunks, cues } = await loadChunksAndCues(supabase, slug)
    if (chunks.length === 0 || cues.length === 0) {
      return NextResponse.json({ error: 'no audio for slug' }, { status: 404 })
    }
    hash = computeAudioRevisionHash(chunks, cues)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'audio lookup failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // Inspect the existing row (if any) and decide what to do.
  if (!force) {
    const row = await getCachedVideo(supabase, slug, aspect)
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
      // A workflow is already in flight for this (slug, aspect, hash). The
      // 202 keeps the client polling, but we don't fire another dispatch.
      return NextResponse.json({ status: 'rendering' }, { status: 202 })
    }
    // 'stale' falls through to a fresh dispatch; 'missing' too.
  }

  // Async path: hand the work to GitHub Actions.
  if (isDispatchConfigured()) {
    try {
      // Mark in-flight BEFORE dispatching. If the dispatch itself fails the
      // stub stays — that's fine, the next poll within 30 min reads it as
      // `rendering`, and after 30 min as `stale` and tries again.
      await markDispatched(supabase, { slug, aspect, audioRevisionHash: hash })
      await dispatchRenderJob({ slug, aspect, baseUrl })
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
    })
    return NextResponse.json({ status: 'ready', ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'render failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
