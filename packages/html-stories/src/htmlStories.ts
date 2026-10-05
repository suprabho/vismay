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
import {
  extractHtmlMeta,
  extractThemeMeta,
  parseThemeMetaContent,
  themeMetaContent,
  type HtmlStoryStatus,
  type ThemeColors,
} from './meta'

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
  /** Aura scene slug laid behind the page and its listing card (migration 087). */
  aura: string | null
}

export interface HtmlStory extends HtmlStorySummary {
  html: string
}

/** A published story as the home page and /stories archive list it. */
export interface PublishedHtmlStory extends HtmlStorySummary {
  /** The page's declared palette (<meta name="vizmaya:theme">), when complete. */
  theme: ThemeColors | null
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
  /** Aura scene slug; null clears it. Omitted: an existing story keeps its aura. */
  aura?: string | null
}

const BASE_COLUMNS =
  'slug, title, description, og_image_url, status, source, published_at, updated_at, created_at'
const SUMMARY_COLUMNS = `${BASE_COLUMNS}, aura`
const AURA_MIGRATION_HINT = 'Setting an aura needs migration 087_html_stories_aura.sql applied'

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
    aura: r.aura ?? null,
  }
}

function mapStory(r: any): HtmlStory {
  return { ...mapSummary(r), html: r.html }
}

/** PostgREST's missing-column errors: 42703 on select, PGRST204 on write. */
function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204'
}

/**
 * Run a select with the current columns, and again without the ones later
 * migrations added (aura: 087, theme_meta: 086) if the database predates
 * them, so the code can ship before the migrations do.
 */
async function selectCompat<T>(
  run: (columns: string) => PromiseLike<{ data: T; error: { code?: string; message: string } | null }>,
  columns: string,
): Promise<{ data: T; error: { code?: string; message: string } | null }> {
  let res = await run(columns)
  if (isMissingColumn(res.error)) res = await run(columns.replace(SUMMARY_COLUMNS, BASE_COLUMNS))
  if (isMissingColumn(res.error)) res = await run(columns.replace(SUMMARY_COLUMNS, BASE_COLUMNS).replace(', theme_meta', ''))
  return res
}

// --- Public read ---

/** The published page for /s/<slug>, or null (unknown, draft, or archived). */
export async function getPublishedHtmlStory(slug: string): Promise<HtmlStory | null> {
  if (!hasServiceEnv()) return null
  const { data, error } = await selectCompat(
    (cols) =>
      createServiceClient().from('html_stories').select(cols).eq('slug', slug).eq('status', 'published').maybeSingle(),
    `${SUMMARY_COLUMNS}, html`,
  )
  if (error) throw new Error(`getPublishedHtmlStory ${slug}: ${error.message}`)
  return data ? mapStory(data) : null
}

/** Every published story, newest first, for the home grid and the archive. */
export async function listPublishedHtmlStories(): Promise<PublishedHtmlStory[]> {
  if (!hasServiceEnv()) return []
  const query = (columns: string) =>
    createServiceClient()
      .from('html_stories')
      .select(columns)
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
  // Before migration 086 the cards just go untinted; before 087, aura-less.
  const { data, error } = await selectCompat(query, `${SUMMARY_COLUMNS}, theme_meta`)
  if (error) throw new Error(`listPublishedHtmlStories: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    ...mapSummary(r),
    theme: r.theme_meta ? parseThemeMetaContent(r.theme_meta) : null,
  }))
}

// --- Admin / publish (service role; include drafts) ---

export async function listHtmlStoriesForAdmin(): Promise<HtmlStorySummary[]> {
  const { data, error } = await selectCompat(
    (cols) => createServiceClient().from('html_stories').select(cols).order('updated_at', { ascending: false }),
    SUMMARY_COLUMNS,
  )
  if (error) throw new Error(`listHtmlStoriesForAdmin: ${error.message}`)
  return (data ?? []).map(mapSummary)
}

export async function getHtmlStoryForAdmin(slug: string): Promise<HtmlStory | null> {
  const { data, error } = await selectCompat(
    (cols) => createServiceClient().from('html_stories').select(cols).eq('slug', slug).maybeSingle(),
    `${SUMMARY_COLUMNS}, html`,
  )
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
  const theme = extractThemeMeta(input.html)
  const status: HtmlStoryStatus = input.status ?? existing?.status ?? 'draft'
  const now = new Date().toISOString()
  const row = {
    slug: input.slug,
    title: input.title?.trim() || meta.title || existing?.title || input.slug,
    description: input.description?.trim() || meta.description || existing?.description || null,
    og_image_url: input.ogImageUrl?.trim() || meta.ogImageUrl || existing?.og_image_url || null,
    html: input.html,
    // Kept beside the document so listings can tint cards without reading it.
    theme_meta: theme ? themeMetaContent(theme) : null,
    status,
    source: input.source,
    // Omitted from the upsert when not given, so a re-post keeps the aura.
    ...(input.aura !== undefined ? { aura: input.aura } : {}),
    published_at: existing?.published_at ?? (status === 'published' ? now : null),
    updated_at: now,
  }

  const upsert = (r: Record<string, unknown>, cols: string) =>
    sb.from('html_stories').upsert(r, { onConflict: 'slug' }).select(cols).single()
  let { data, error } = await upsert(row, SUMMARY_COLUMNS)
  if (isMissingColumn(error)) {
    // Before migration 087 (aura) or 086 (palette; the backfill picks it up).
    if (input.aura != null) throw new Error(`${AURA_MIGRATION_HINT} (${input.slug})`)
    const { aura: _a, ...pre087 } = row as typeof row & { aura?: unknown }
    ;({ data, error } = await upsert(pre087, BASE_COLUMNS))
    if (isMissingColumn(error)) {
      const { theme_meta: _t, ...pre086 } = pre087
      ;({ data, error } = await upsert(pre086, BASE_COLUMNS))
    }
  }
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
  patch: {
    title?: string
    description?: string | null
    ogImageUrl?: string | null
    status?: HtmlStoryStatus
    aura?: string | null
  },
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
  if (patch.aura !== undefined) update.aura = patch.aura
  const run = (cols: string) => sb.from('html_stories').update(update).eq('slug', slug).select(cols).maybeSingle()
  let { data, error } = await run(SUMMARY_COLUMNS)
  if (isMissingColumn(error)) {
    if (patch.aura !== undefined) throw new Error(`${AURA_MIGRATION_HINT} (${slug})`)
    ;({ data, error } = await run(BASE_COLUMNS))
  }
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
