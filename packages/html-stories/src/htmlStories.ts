/**
 * Server-side reads/writes for agent-authored HTML stories.
 *
 * Tables html_stories + html_story_versions (migration 085). Consumers: the
 * public /s/<slug> route and the token-gated publish API in vizmaya-fyi, and
 * the HTML stories tab in admin.
 *
 * Server only — imports the service Supabase client. Client components take
 * types and helpers from ./meta.
 */

import { createServiceClient } from '@vismay/content-source/supabase'
import { extractHtmlMeta, type HtmlStoryStatus } from './meta'

export interface HtmlStorySummary {
  slug: string
  title: string
  description: string | null
  ogImageUrl: string | null
  status: HtmlStoryStatus
  source: string | null
  publishedAt: string | null
  updatedAt: string
  createdAt: string
}

export interface HtmlStory extends HtmlStorySummary {
  html: string
}

export interface HtmlStoryVersion {
  id: number
  slug: string
  title: string
  source: string | null
  createdAt: string
}

export interface HtmlStoryInput {
  slug: string
  html: string
  /** Overrides what the document's own <title> / meta tags say. */
  title?: string | null
  description?: string | null
  ogImageUrl?: string | null
  /** Omitted: a new story is a draft, an existing one keeps its status. */
  status?: HtmlStoryStatus
  /** Who posted it: 'admin', 'api', 'mcp', or a free-form agent name. */
  source: string
}

const SUMMARY_COLUMNS =
  'slug, title, description, og_image_url, status, source, published_at, updated_at, created_at'

export function hasServiceEnv(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function mapSummary(r: any): HtmlStorySummary {
  return {
    slug: r.slug,
    title: r.title,
    description: r.description ?? null,
    ogImageUrl: r.og_image_url ?? null,
    status: r.status,
    source: r.source ?? null,
    publishedAt: r.published_at ?? null,
    updatedAt: r.updated_at,
    createdAt: r.created_at,
  }
}

function mapStory(r: any): HtmlStory {
  return { ...mapSummary(r), html: r.html }
}

// --- Public read ---

/** The published page for /s/<slug>, or null (unknown, draft, or archived). */
export async function getPublishedHtmlStory(slug: string): Promise<HtmlStory | null> {
  if (!hasServiceEnv()) return null
  const { data, error } = await createServiceClient()
    .from('html_stories')
    .select(`${SUMMARY_COLUMNS}, html`)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  if (error) throw new Error(`getPublishedHtmlStory ${slug}: ${error.message}`)
  return data ? mapStory(data) : null
}

// --- Admin / publish (service role; include drafts) ---

export async function listHtmlStoriesForAdmin(): Promise<HtmlStorySummary[]> {
  const { data, error } = await createServiceClient()
    .from('html_stories')
    .select(SUMMARY_COLUMNS)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`listHtmlStoriesForAdmin: ${error.message}`)
  return (data ?? []).map(mapSummary)
}

export async function getHtmlStoryForAdmin(slug: string): Promise<HtmlStory | null> {
  const { data, error } = await createServiceClient()
    .from('html_stories')
    .select(`${SUMMARY_COLUMNS}, html`)
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(`getHtmlStoryForAdmin ${slug}: ${error.message}`)
  return data ? mapStory(data) : null
}

/**
 * Create or replace a story's HTML. Title/description/og:image come from the
 * explicit input first, then from the new document's own tags, then from the
 * previous row. A version row is appended whenever the HTML changes.
 */
export async function saveHtmlStory(
  input: HtmlStoryInput,
): Promise<{ story: HtmlStorySummary; created: boolean }> {
  const sb = createServiceClient()
  const { data: existing, error: readErr } = await sb
    .from('html_stories')
    .select('slug, title, description, og_image_url, status, published_at, html')
    .eq('slug', input.slug)
    .maybeSingle()
  if (readErr) throw new Error(`saveHtmlStory ${input.slug}: ${readErr.message}`)

  const meta = extractHtmlMeta(input.html)
  const status: HtmlStoryStatus = input.status ?? existing?.status ?? 'draft'
  const now = new Date().toISOString()
  const row = {
    slug: input.slug,
    title: input.title?.trim() || meta.title || existing?.title || input.slug,
    description: input.description?.trim() || meta.description || existing?.description || null,
    og_image_url: input.ogImageUrl?.trim() || meta.ogImageUrl || existing?.og_image_url || null,
    html: input.html,
    status,
    source: input.source,
    published_at: existing?.published_at ?? (status === 'published' ? now : null),
    updated_at: now,
  }

  const { data, error } = await sb
    .from('html_stories')
    .upsert(row, { onConflict: 'slug' })
    .select(SUMMARY_COLUMNS)
    .single()
  if (error) throw new Error(`saveHtmlStory ${input.slug}: ${error.message}`)

  if (!existing || existing.html !== input.html) {
    const { error: vErr } = await sb
      .from('html_story_versions')
      .insert({ slug: input.slug, title: row.title, html: input.html, source: input.source })
    if (vErr) throw new Error(`saveHtmlStory ${input.slug} (version): ${vErr.message}`)
  }

  return { story: mapSummary(data), created: !existing }
}

/** Change status / metadata without touching the HTML. */
export async function updateHtmlStoryMeta(
  slug: string,
  patch: { title?: string; description?: string | null; ogImageUrl?: string | null; status?: HtmlStoryStatus },
): Promise<HtmlStorySummary | null> {
  const sb = createServiceClient()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) update.title = patch.title
  if (patch.description !== undefined) update.description = patch.description
  if (patch.ogImageUrl !== undefined) update.og_image_url = patch.ogImageUrl
  if (patch.status !== undefined) {
    update.status = patch.status
    if (patch.status === 'published') {
      const { data: cur } = await sb.from('html_stories').select('published_at').eq('slug', slug).maybeSingle()
      if (cur && !cur.published_at) update.published_at = update.updated_at
    }
  }
  const { data, error } = await sb
    .from('html_stories')
    .update(update)
    .eq('slug', slug)
    .select(SUMMARY_COLUMNS)
    .maybeSingle()
  if (error) throw new Error(`updateHtmlStoryMeta ${slug}: ${error.message}`)
  return data ? mapSummary(data) : null
}

export async function deleteHtmlStory(slug: string): Promise<void> {
  const { error } = await createServiceClient().from('html_stories').delete().eq('slug', slug)
  if (error) throw new Error(`deleteHtmlStory ${slug}: ${error.message}`)
}

export async function listHtmlStoryVersions(slug: string, limit = 50): Promise<HtmlStoryVersion[]> {
  const { data, error } = await createServiceClient()
    .from('html_story_versions')
    .select('id, slug, title, source, created_at')
    .eq('slug', slug)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listHtmlStoryVersions ${slug}: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    source: r.source ?? null,
    createdAt: r.created_at,
  }))
}

export async function getHtmlStoryVersionHtml(slug: string, id: number): Promise<string | null> {
  const { data, error } = await createServiceClient()
    .from('html_story_versions')
    .select('html')
    .eq('slug', slug)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getHtmlStoryVersionHtml ${slug}#${id}: ${error.message}`)
  return (data?.html as string | undefined) ?? null
}
