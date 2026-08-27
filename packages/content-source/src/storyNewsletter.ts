/**
 * Shared types + cache-lookup + content-revision-hash for the HTML
 * newsletter render pipeline. Parallel to storyPdf.ts.
 *
 * The cache key hashes the content that drives the rendered issue
 * (markdown, config.yaml, newsletter.yaml, all chart JSON for the slug).
 * Code-only redeploys don't invalidate; any content edit does.
 */

import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContentSource } from './contentSource'

export const NEWSLETTER_BUCKET = 'story-newsletter'

export interface CachedNewsletter {
  public_url: string
  substack_url: string | null
  content_revision_hash: string
  storage_path: string
  /** Set when an async render is dispatched and not yet completed. */
  dispatched_at: string | null
}

export async function computeNewsletterRevisionHash(
  source: ContentSource,
  slug: string
): Promise<string> {
  const [markdown, configYaml, newsletterYaml, chartIds] = await Promise.all([
    source.readMarkdown(slug),
    source.readConfigYaml(slug),
    source.readNewsletterYaml(slug),
    source.listChartIds(slug),
  ])

  const sortedIds = [...chartIds].sort()
  const charts = await Promise.all(
    sortedIds.map(async (id) => [id, await source.readChart(slug, id)] as const)
  )

  const payload = JSON.stringify({
    markdown: markdown ?? '',
    config: configYaml ?? '',
    newsletter: newsletterYaml ?? '',
    charts: charts.map(([id, data]) => [id, data ?? null]),
  })

  return crypto.createHash('sha256').update(payload).digest('hex')
}

export async function getCachedNewsletter(
  supabase: SupabaseClient,
  slug: string
): Promise<CachedNewsletter | null> {
  const { data, error } = await supabase
    .from('story_newsletters')
    .select('public_url, substack_url, content_revision_hash, storage_path, dispatched_at')
    .eq('slug', slug)
    .maybeSingle()
  if (error) {
    console.error(`[storyNewsletter] cache lookup failed: ${error.message}`)
    return null
  }
  return (data as CachedNewsletter | null) ?? null
}

/**
 * Window during which a stub row counts as "render in progress" — beyond
 * this we assume the workflow died and let the next poll re-dispatch. Same
 * rationale + value as the PDF pipeline (render-newsletter.yml has
 * timeout-minutes=15 plus CI overhead).
 */
export const DISPATCH_STALE_MS = 30 * 60 * 1000

export type NewsletterState =
  | { kind: 'ready'; row: CachedNewsletter }
  | { kind: 'rendering' }
  | { kind: 'stale' }
  | { kind: 'missing' }

export function classifyNewsletterState(
  row: CachedNewsletter | null,
  expectedHash: string,
  now: number = Date.now()
): NewsletterState {
  if (!row || row.content_revision_hash !== expectedHash) return { kind: 'missing' }
  if (row.public_url) return { kind: 'ready', row }
  if (row.dispatched_at) {
    const age = now - new Date(row.dispatched_at).getTime()
    return age < DISPATCH_STALE_MS ? { kind: 'rendering' } : { kind: 'stale' }
  }
  return { kind: 'missing' }
}

/** Storage path of the email-variant HTML document. */
export function newsletterStoragePath(slug: string): string {
  return `${slug}/newsletter.html`
}

/** Storage path of the Substack-paste-variant HTML document. */
export function newsletterSubstackPath(slug: string): string {
  return `${slug}/newsletter.substack.html`
}

/** Storage path of a captured section visual. */
export function newsletterImagePath(slug: string, visualKey: string): string {
  return `${slug}/images/${visualKey}.png`
}

/**
 * Insert/update a stub row marking the slug as in flight. Called right
 * before dispatching the GitHub Actions workflow; the renderer overwrites
 * this row with the real URLs on completion.
 */
export async function markNewsletterDispatched(
  supabase: SupabaseClient,
  args: { slug: string; contentRevisionHash: string }
): Promise<void> {
  const { error } = await supabase.from('story_newsletters').upsert(
    {
      slug: args.slug,
      storage_path: newsletterStoragePath(args.slug),
      public_url: '',
      substack_url: null,
      content_revision_hash: args.contentRevisionHash,
      dispatched_at: new Date().toISOString(),
    },
    { onConflict: 'slug' }
  )
  if (error) throw new Error(`mark newsletter dispatched: ${error.message}`)
}
