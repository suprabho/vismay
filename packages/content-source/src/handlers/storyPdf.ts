import { NextResponse } from 'next/server'
import { createServiceClient } from '../supabase'
import { getContentSource } from '../contentSource'
import {
  classifyPdfState,
  computeContentRevisionHash,
  getCachedPdf,
  isPdfFormat,
  markPdfDispatched,
  type PdfFormat,
} from '../storyPdf'

export interface StoryPdfHandlerOptions {
  isDispatchConfigured: () => boolean
  dispatch: (args: {
    slug: string
    format: PdfFormat
    baseUrl: string
  }) => Promise<void>
  /** Local-dev fallback (Playwright sync render). Optional. */
  render?: (args: {
    supabase: ReturnType<typeof createServiceClient>
    slug: string
    format: PdfFormat
    baseUrl: string
    force?: boolean
  }) => Promise<{
    public_url: string
    content_revision_hash: string
    cached: boolean
  }>
}

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

/**
 * GET /api/story-pdf/[slug]?format=report|slides[&force=1]
 *
 *   200 { status: 'ready', public_url, cached, content_revision_hash }
 *   202 { status: 'rendering' }      dispatch fired, poll again later
 *   400 { error }                    bad slug or format
 *   500 { error }                    render or dispatch failed
 */
export function createStoryPdfHandler(opts: StoryPdfHandlerOptions) {
  return {
    async GET(
      req: Request,
      { params }: { params: Promise<{ slug: string }> }
    ) {
      try {
        return await runStoryPdfGet(opts, req, params)
      } catch (err) {
        // Top-level safety net so any unexpected throw still surfaces as a
        // readable JSON {error}, never an opaque Next.js HTML 500.
        const message =
          err instanceof Error ? err.message : 'story-pdf handler crashed'
        return NextResponse.json({ error: message }, { status: 500 })
      }
    },
  }
}

async function runStoryPdfGet(
  opts: StoryPdfHandlerOptions,
  req: Request,
  params: Promise<{ slug: string }>
) {
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) {
    return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  }

  const url = new URL(req.url)
  const format = url.searchParams.get('format')
  if (!isPdfFormat(format)) {
    return NextResponse.json(
      { error: 'format must be report or slides' },
      { status: 400 }
    )
  }
  const force = url.searchParams.get('force') === '1'

  // Render the PDF against the dedicated render service when its per-surface
  // strangler env is set (RENDER_SURFACE_URL_REPORT / _SLIDES), falling back to
  // this request's own origin — the historical behaviour — when unset. Mirrors
  // the gate in @vismay/verticals `renderSurfaceUrl`, kept as a direct env read
  // so content-source takes no dependency on the verticals registry. Set the
  // env on whichever deployment runs this route (the consumer site that hosts
  // the /reports builder, e.g. vizmaya-fyi).
  const renderSurfaceEnv =
    format === 'slides' ? 'RENDER_SURFACE_URL_SLIDES' : 'RENDER_SURFACE_URL_REPORT'
  const baseUrl =
    process.env[renderSurfaceEnv]?.replace(/\/$/, '') ||
    `${url.protocol}//${url.host}`

  let supabase: ReturnType<typeof createServiceClient>
  let hash: string
  try {
    // createServiceClient() throws synchronously when SUPABASE_SERVICE_ROLE_KEY
    // is missing. Catch it so the client sees a real error message instead of
    // an opaque Next.js 500.
    supabase = createServiceClient()
    const source = getContentSource()
    hash = await computeContentRevisionHash(source, slug)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'hash compute failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  if (!force) {
    const cached = await getCachedPdf(supabase, slug, format)
    const state = classifyPdfState(cached, hash)
    if (state.kind === 'ready') {
      return NextResponse.json({
        status: 'ready',
        public_url: state.row.public_url,
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
      await markPdfDispatched(supabase, {
        slug,
        format,
        contentRevisionHash: hash,
      })
      await opts.dispatch({ slug, format, baseUrl })
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
    const result = await opts.render({
      supabase,
      slug,
      format,
      baseUrl,
      force,
    })
    return NextResponse.json({ status: 'ready', ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'render failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
