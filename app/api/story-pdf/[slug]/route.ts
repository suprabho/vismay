import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getContentSource } from '@/lib/contentSource'
import {
  classifyPdfState,
  computeContentRevisionHash,
  getCachedPdf,
  isPdfFormat,
  markPdfDispatched,
} from '@/lib/storyPdf'
import {
  dispatchPdfRenderJob,
  isPdfDispatchConfigured,
} from '@/lib/storyPdfDispatch'
import { renderStoryPdf } from '@/lib/storyPdfRender'

/**
 * Two render paths share this route:
 *
 *  - **Local dev** (no `GITHUB_DISPATCH_TOKEN`): we shell out to Playwright
 *    synchronously inside the request. Works on a Mac with Chromium
 *    installed; the request can take ~30s.
 *  - **Production** (token + repo configured): we fire a `workflow_dispatch`
 *    to GitHub Actions and return 202. The runner there does the render and
 *    uploads the PDF to the same Supabase bucket. Callers poll this endpoint
 *    until the cache lookup returns a matching row.
 *
 * Cache key: `(slug, format, content_revision_hash)`. The hash covers
 * markdown + config.yaml + share.yaml + report.yaml + every chart JSON for
 * the slug — so any content edit invalidates the cached PDF, but a code-only
 * redeploy doesn't.
 *
 * In-flight tracking lives in the `story_pdfs.dispatched_at` column. A stub
 * row is written at dispatch time so subsequent polls return 202 without
 * re-dispatching. Without this guard, one click stacks dozens of concurrent
 * workflow runs because every 3s poll sees a cache miss.
 */
export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

/**
 * GET /api/story-pdf/[slug]?format=report|slides[&force=1]
 *
 * Responses:
 *   200 { status: 'ready', public_url, cached, content_revision_hash }
 *   202 { status: 'rendering' }     dispatch fired, poll again later
 *   400 { error }                   bad slug or format
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
  const format = url.searchParams.get('format')
  if (!isPdfFormat(format)) {
    return NextResponse.json(
      { error: 'format must be report or slides' },
      { status: 400 }
    )
  }
  const force = url.searchParams.get('force') === '1'

  // The headless browser fetches `/story/<slug>/<format>?print=1` from this
  // same app — derive the base URL from the incoming request so it works in
  // dev, preview, and production without env-var plumbing.
  const baseUrl = `${url.protocol}//${url.host}`

  const supabase = createServiceClient()

  let hash: string
  try {
    const source = getContentSource()
    hash = await computeContentRevisionHash(source, slug)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'hash compute failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // Inspect the existing row (if any) and decide what to do.
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
      // A workflow is already in flight for this (slug, format, hash). The
      // 202 keeps the client polling, but we don't fire another dispatch.
      return NextResponse.json({ status: 'rendering' }, { status: 202 })
    }
    // 'stale' falls through to a fresh dispatch; 'missing' too.
  }

  // Async path: hand the work to GitHub Actions.
  if (isPdfDispatchConfigured()) {
    try {
      // Mark in-flight BEFORE dispatching. If the dispatch itself fails the
      // stub stays — that's fine, the next poll within DISPATCH_STALE_MS
      // reads it as `rendering`, and after that as `stale` and tries again.
      await markPdfDispatched(supabase, {
        slug,
        format,
        contentRevisionHash: hash,
      })
      await dispatchPdfRenderJob({ slug, format, baseUrl })
      return NextResponse.json({ status: 'rendering' }, { status: 202 })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'dispatch failed'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // Sync path: only viable on a host with Playwright Chromium available.
  try {
    const result = await renderStoryPdf({
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
