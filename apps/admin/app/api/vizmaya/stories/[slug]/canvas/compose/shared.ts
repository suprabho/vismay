import { isAllowedTextModel, DEFAULT_TEXT_MODEL, type SourceDoc } from '@vismay/story-pipeline'
import type { StorySource } from '@vismay/content-source/storySources'

/** Shared helpers for the canvas compose routes (sources / angles / outline). */

/** Resolve a text-model alias from request input, then a stored fallback. */
export function resolveModel(input: unknown, fallback?: string | null): string {
  if (typeof input === 'string' && isAllowedTextModel(input)) return input
  if (typeof fallback === 'string' && isAllowedTextModel(fallback)) return fallback
  return DEFAULT_TEXT_MODEL
}

/** Map persisted `story_sources` rows to the pipeline's `SourceDoc` shape,
 *  keeping only successfully-extracted sources. */
export function sourcesToDocs(rows: StorySource[]): SourceDoc[] {
  return rows
    .filter((r) => r.status === 'extracted' && !!r.extractedText)
    .map((r) => ({
      origin: r.sourceUrl ?? r.filename ?? r.title ?? r.id,
      kind: r.kind,
      title: r.title ?? r.filename ?? 'Untitled',
      byline: r.byline ?? undefined,
      body: r.extractedText ?? '',
    }))
}
