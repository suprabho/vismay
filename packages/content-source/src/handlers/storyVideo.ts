import { NextResponse } from 'next/server'
import { createServiceClient } from '../supabase'
import {
  classifyVideoState,
  computeAudioRevisionHash,
  computeTimeline,
  getCachedVideo,
  loadChunksAndCues,
  markDispatched,
  type VideoAspect,
  type VideoRange,
} from '../storyVideo'

/**
 * Hooks the host app supplies. The factory doesn't know how the app wants
 * to fire workflows or run a sync render — it just knows how to compute
 * cache state and pick which path to take.
 */
export interface StoryVideoHandlerOptions {
  isDispatchConfigured: () => boolean
  dispatch: (args: {
    slug: string
    aspect: VideoAspect
    baseUrl: string
    range?: VideoRange
  }) => Promise<void>
  /** Local-dev fallback. If absent, requests fail with 500 when dispatch isn't configured. */
  render?: (args: {
    supabase: ReturnType<typeof createServiceClient>
    slug: string
    aspect: VideoAspect
    baseUrl: string
    force?: boolean
    range?: VideoRange
  }) => Promise<{ public_url: string; duration_ms: number | null; cached?: boolean }>
}

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
 *   [&startMs=N&endMs=N]             sub-range render
 *
 * Responses:
 *   200 { status: 'ready', public_url, cached, duration_ms }
 *   202 { status: 'rendering' }      dispatch fired (or already in flight)
 *   400 { error }                    bad slug, aspect, or range
 *   404 { error }                    no audio for slug
 *   500 { error }                    render or dispatch failed
 */
export function createStoryVideoHandler(opts: StoryVideoHandlerOptions) {
  return {
    async GET(
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

      // Headless browser fetches `/story/<slug>?autoplay=1` from this same
      // origin — derive baseUrl from the request so dev/preview/prod all work
      // without env plumbing.
      const baseUrl = `${url.protocol}//${url.host}`

      let supabase: ReturnType<typeof createServiceClient>
      let hash: string
      let totalMs: number
      try {
        // createServiceClient() throws synchronously when SUPABASE_SERVICE_ROLE_KEY
        // is missing. Catch it so the client sees a real error message instead of
        // an opaque Next.js 500.
        supabase = createServiceClient()
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

      // Cache hit / in-flight check
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
          return NextResponse.json({ status: 'rendering' }, { status: 202 })
        }
      }

      const dispatchRange =
        range.startMs === 0 && range.endMs === totalMs ? undefined : range

      // Async path: GitHub Actions
      if (opts.isDispatchConfigured()) {
        try {
          await markDispatched(supabase, {
            slug,
            aspect,
            audioRevisionHash: hash,
            range,
            totalMs,
          })
          await opts.dispatch({ slug, aspect, baseUrl, range: dispatchRange })
          return NextResponse.json({ status: 'rendering' }, { status: 202 })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'dispatch failed'
          return NextResponse.json({ error: message }, { status: 500 })
        }
      }

      // Sync path: host must provide a render function and have Playwright + ffmpeg
      if (!opts.render) {
        return NextResponse.json(
          {
            error:
              'No render function configured and GITHUB_DISPATCH_TOKEN/REPO not set',
          },
          { status: 500 }
        )
      }

      try {
        const result = await opts.render({
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
    },
  }
}
