import { NextResponse } from 'next/server'
import { createServiceClient } from '../supabase'
import { getContentSource } from '../contentSource'
import {
  classifyNewsletterState,
  computeNewsletterRevisionHash,
  getCachedNewsletter,
  markNewsletterDispatched,
} from '../storyNewsletter'

export interface StoryNewsletterHandlerOptions {
  isDispatchConfigured: () => boolean
  dispatch: (args: { slug: string; baseUrl: string }) => Promise<void>
  /** Local-dev fallback (Playwright sync render). Optional. */
  render?: (args: {
    supabase: ReturnType<typeof createServiceClient>
    slug: string
    baseUrl: string
    force?: boolean
  }) => Promise<{
    public_url: string
    substack_url: string
    content_revision_hash: string
    cached: boolean
  }>
}

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

/**
 * GET /api/story-newsletter/[slug][?force=1]
 *
 *   200 { status: 'ready', public_url, substack_url, cached, content_revision_hash }
 *   202 { status: 'rendering' }      dispatch fired, poll again later
 *   400 { error }                    bad slug
 *   500 { error }                    render or dispatch failed
 */
export function createStoryNewsletterHandler(opts: StoryNewsletterHandlerOptions) {
  return {
    async GET(
      req: Request,
      { params }: { params: Promise<{ slug: string }> }
    ) {
      try {
        return await runStoryNewsletterGet(opts, req, params)
      } catch (err) {
        // Top-level safety net so any unexpected throw still surfaces as a
        // readable JSON {error}, never an opaque Next.js HTML 500.
        const message =
          err instanceof Error ? err.message : 'story-newsletter handler crashed'
        return NextResponse.json({ error: message }, { status: 500 })
      }
    },
  }
}

async function runStoryNewsletterGet(
  opts: StoryNewsletterHandlerOptions,
  req: Request,
  params: Promise<{ slug: string }>
) {
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) {
    return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  }

  const url = new URL(req.url)
  const force = url.searchParams.get('force') === '1'

  // Render against the dedicated render service when its per-surface
  // strangler env is set, falling back to this request's own origin. Same
  // gate as the report/slides handler.
  const baseUrl =
    process.env.RENDER_SURFACE_URL_NEWSLETTER?.replace(/\/$/, '') ||
    `${url.protocol}//${url.host}`

  let supabase: ReturnType<typeof createServiceClient>
  let hash: string
  try {
    supabase = createServiceClient()
    const source = getContentSource()
    hash = await computeNewsletterRevisionHash(source, slug)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'hash compute failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  if (!force) {
    const cached = await getCachedNewsletter(supabase, slug)
    const state = classifyNewsletterState(cached, hash)
    if (state.kind === 'ready') {
      return NextResponse.json({
        status: 'ready',
        public_url: state.row.public_url,
        substack_url: state.row.substack_url,
        cached: true,
        content_revision_hash: hash,
      })
    }
    if (state.kind === 'rendering') {
      return NextResponse.json({ status: 'rendering' }, { status: 202 })
    }
  }

  // Async path: GitHub Actions
  if (opts.isDispatchConfigured()) {
    try {
      await markNewsletterDispatched(supabase, { slug, contentRevisionHash: hash })
      await opts.dispatch({ slug, baseUrl })
      return NextResponse.json({ status: 'rendering' }, { status: 202 })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'dispatch failed'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // Sync path: host must provide a render function
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
    const result = await opts.render({ supabase, slug, baseUrl, force })
    return NextResponse.json({ status: 'ready', ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'render failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
