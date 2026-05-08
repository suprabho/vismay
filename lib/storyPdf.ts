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
    .select('public_url, content_revision_hash, storage_path')
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
