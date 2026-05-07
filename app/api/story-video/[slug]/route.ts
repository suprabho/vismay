import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { renderStoryVideo } from '@/lib/storyVideoRender'
import type { VideoAspect } from '@/lib/storyVideo'

/**
 * Headless render of an autoplay session. Spawns Chromium + ffmpeg, so this
 * route must run in the Node runtime, not Edge. The synchronous render takes
 * ~real-time playback + ~10–30s of ffmpeg work, so we bump maxDuration to the
 * Vercel Pro ceiling. Stories longer than ~4 minutes will need a separate
 * worker; the renderer is reused so that swap is config-only.
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
 * Returns `{ status: 'ready', public_url, cached, duration_ms }`. The
 * `cached` flag tells the caller whether a fresh render happened on this
 * request (false) or the cached MP4 was reused (true). Cache key includes
 * per-cue timings, so saving a tuned cue invalidates the video.
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
