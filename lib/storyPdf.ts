/**
 * Shared types + cache-lookup + content-revision-hash for the PDF render
 * pipeline. Parallel to lib/storyVideo.ts.
 *
 * The PDF cache key hashes the *content* that drives layout (markdown,
 * config.yaml, share.yaml, report.yaml, all chart JSON for the slug). Code-
 * only redeploys don't invalidate; any content edit does.
 */

import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContentSource } from './contentSource'

export type PdfFormat = 'report' | 'slides'

export function isPdfFormat(v: string | null): v is PdfFormat {
  return v === 'report' || v === 'slides'
}

export interface CachedPdf {
  public_url: string
  content_revision_hash: string
  storage_path: string
  /** Set when an async render is dispatched and not yet completed. */
  dispatched_at: string | null
}

/**
 * Hash inputs that drive the rendered PDF: all four content blobs (md, config,
 * share, report) + every chart JSON for the slug, sorted by chart id so two
 * fs/db backends with the same content produce the same hash.
 */
export async function computeContentRevisionHash(
  source: ContentSource,
  slug: string
): Promise<string> {
  const [markdown, configYaml, shareYaml, reportYaml, chartIds] =
    await Promise.all([
      source.readMarkdown(slug),
      source.readConfigYaml(slug),
      source.readShareYaml(slug),
      source.readReportYaml(slug),
      source.listChartIds(slug),
    ])

  const sortedIds = [...chartIds].sort()
  const charts = await Promise.all(
    sortedIds.map(async (id) => [id, await source.readChart(slug, id)] as const)
  )

  const payload = JSON.stringify({
    markdown: markdown ?? '',
    config: configYaml ?? '',
    share: shareYaml ?? '',
    report: reportYaml ?? '',
    charts: charts.map(([id, data]) => [id, data ?? null]),
  })

  return crypto.createHash('sha256').update(payload).digest('hex')
}

export async function getCachedPdf(
  supabase: SupabaseClient,
  slug: string,
  format: PdfFormat
): Promise<CachedPdf | null> {
  const { data, error } = await supabase
    .from('story_pdfs')
    .select('public_url, content_revision_hash, storage_path, dispatched_at')
    .eq('slug', slug)
    .eq('format', format)
    .maybeSingle()
  if (error) {
    console.error(`[storyPdf] cache lookup failed: ${error.message}`)
    return null
  }
  return (data as CachedPdf | null) ?? null
}

export const PDF_BUCKET = 'story-pdf'

/**
 * Window during which a stub row counts as "render in progress" — beyond
 * this we assume the workflow died (CI failure, timeout, secret rotation,
 * etc.) and let the next poll re-dispatch. Comfortably longer than any
 * reasonable PDF render: render-pdf.yml has timeout-minutes=15, plus a few
 * minutes of CI overhead. 30 min gives a safe cushion.
 */
export const DISPATCH_STALE_MS = 30 * 60 * 1000

/**
 * What a `story_pdfs` row tells us right now.
 *
 *   - `ready`        cached PDF exists for the current content_revision_hash.
 *   - `rendering`    a stub row was written within DISPATCH_STALE_MS and the
 *                    real PDF hasn't landed yet. Don't re-dispatch.
 *   - `stale`        a stub row exists but is older than DISPATCH_STALE_MS;
 *                    treat as a failed render and dispatch fresh.
 *   - `missing`      no row, or row's hash doesn't match — needs a render.
 */
export type PdfState =
  | { kind: 'ready'; row: CachedPdf }
  | { kind: 'rendering' }
  | { kind: 'stale' }
  | { kind: 'missing' }

export function classifyPdfState(
  row: CachedPdf | null,
  expectedHash: string,
  now: number = Date.now()
): PdfState {
  if (!row || row.content_revision_hash !== expectedHash) return { kind: 'missing' }
  if (row.public_url) return { kind: 'ready', row }
  if (row.dispatched_at) {
    const age = now - new Date(row.dispatched_at).getTime()
    return age < DISPATCH_STALE_MS ? { kind: 'rendering' } : { kind: 'stale' }
  }
  return { kind: 'missing' }
}

/**
 * Insert/update a stub row marking the (slug, format) as in flight. Called
 * right before dispatching the GitHub Actions workflow. The renderer then
 * overwrites this row with the real `public_url` on completion (see
 * lib/storyPdfRender.ts).
 */
export async function markPdfDispatched(
  supabase: SupabaseClient,
  args: { slug: string; format: PdfFormat; contentRevisionHash: string }
): Promise<void> {
  const storagePath = `${args.slug}/${args.format}.pdf`
  const { error } = await supabase.from('story_pdfs').upsert(
    {
      slug: args.slug,
      format: args.format,
      storage_path: storagePath,
      public_url: '',
      content_revision_hash: args.contentRevisionHash,
      dispatched_at: new Date().toISOString(),
    },
    { onConflict: 'slug,format' }
  )
  if (error) throw new Error(`mark pdf dispatched: ${error.message}`)
}
