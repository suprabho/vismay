/**
 * Server-side reads/writes for agent-authored HTML stories.
 *
 * Tables html_stories + html_story_versions (migration 085). Consumers: the
 * public /s/<slug> route and the token-gated publish API in vizmaya-fyi and
 * footshorts, and the HTML stories tabs in admin.
 *
 * One table serves every app (./apps): each row's `app_slug` says which site
 * it belongs to, and every read here is scoped to one app, so a footshorts
 * listing never shows a vizmaya story. Slugs are the primary key, so they are
 * unique across apps: a save that would take over another app's slug is
 * refused rather than silently moving the story.
 *
 * Server only — imports the service Supabase client. Client components take
 * types and helpers from ./meta.
 */

import { createServiceClient } from '@vismay/content-source/supabase'
import { DEFAULT_HTML_STORY_APP, type HtmlStoryApp } from './apps'
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
  /** The site this story is hosted on (html_stories.app_slug). */
  app: HtmlStoryApp
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
  /** The site to host it on. Omitted: vizmaya-fyi (the column default). */
  app?: HtmlStoryApp
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
  'slug, app_slug, title, description, og_image_url, status, source, published_at, updated_at, created_at'
const SUMMARY_COLUMNS = `${BASE_COLUMNS}, aura`
const AURA_MIGRATION_HINT = 'Setting an aura needs migration 087_html_stories_aura.sql applied'

export function hasServiceEnv(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function mapSummary(r: any): HtmlStorySummary {
  return {
    slug: r.slug,
    app: (r.app_slug as HtmlStoryApp | undefined) ?? DEFAULT_HTML_STORY_APP,
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

/** The published page for /s/<slug> on one app, or null (unknown, another app's, draft, or archived). */
export async function getPublishedHtmlStory(
  slug: string,
  app: HtmlStoryApp = DEFAULT_HTML_STORY_APP,
): Promise<HtmlStory | null> {
  if (!hasServiceEnv()) return null
  const { data, error } = await selectCompat(
    (cols) =>
      createServiceClient()
        .from('html_stories')
        .select(cols)
        .eq('slug', slug)
        .eq('app_slug', app)
        .eq('status', 'published')
        .maybeSingle(),
    `${SUMMARY_COLUMNS}, html`,
  )
  if (error) throw new Error(`getPublishedHtmlStory ${slug}: ${error.message}`)
  return data ? mapStory(data) : null
}

/** Every published story on one app, newest first, for its home grid / archive / editorial tab. */
export async function listPublishedHtmlStories(
  app: HtmlStoryApp = DEFAULT_HTML_STORY_APP,
): Promise<PublishedHtmlStory[]> {
  if (!hasServiceEnv()) return []
  const query = (columns: string) =>
    createServiceClient()
      .from('html_stories')
      .select(columns)
      .eq('app_slug', app)
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

export async function listHtmlStoriesForAdmin(
  app: HtmlStoryApp = DEFAULT_HTML_STORY_APP,
): Promise<HtmlStorySummary[]> {
  const { data, error } = await selectCompat(
    (cols) =>
      createServiceClient()
        .from('html_stories')
        .select(cols)
        .eq('app_slug', app)
        .order('updated_at', { ascending: false }),
    SUMMARY_COLUMNS,
  )
  if (error) throw new Error(`listHtmlStoriesForAdmin: ${error.message}`)
  return (data ?? []).map(mapSummary)
}

export async function getHtmlStoryForAdmin(
  slug: string,
  app: HtmlStoryApp = DEFAULT_HTML_STORY_APP,
): Promise<HtmlStory | null> {
  const { data, error } = await selectCompat(
    (cols) =>
      createServiceClient().from('html_stories').select(cols).eq('slug', slug).eq('app_slug', app).maybeSingle(),
    `${SUMMARY_COLUMNS}, html`,
  )
  if (error) throw new Error(`getHtmlStoryForAdmin ${slug}: ${error.message}`)
  return data ? mapStory(data) : null
}

/** The error a save gets when the slug is already another app's story. */
export class HtmlStorySlugTakenError extends Error {
  constructor(
    public readonly slug: string,
    public readonly ownerApp: HtmlStoryApp,
  ) {
    super(`slug "${slug}" is already a ${ownerApp} story; pick another slug`)
    this.name = 'HtmlStorySlugTakenError'
  }
}

/**
 * Create or replace a story's HTML. Title/description/og:image come from the
 * explicit input first, then from the new document's own tags, then from the
 * previous row. A version row is appended whenever the HTML changes.
 *
 * Throws {@link HtmlStorySlugTakenError} when the slug belongs to a different
 * app: slugs are global (the primary key), and a re-post must never move a
 * story from one site to another.
 */
export async function saveHtmlStory(
  input: HtmlStoryInput,
): Promise<{ story: HtmlStorySummary; created: boolean }> {
  const sb = createServiceClient()
  const app = input.app ?? DEFAULT_HTML_STORY_APP
  const { data: existing, error: readErr } = await sb
    .from('html_stories')
    .select('slug, app_slug, title, description, og_image_url, status, published_at, html')
    .eq('slug', input.slug)
    .maybeSingle()
  if (readErr) throw new Error(`saveHtmlStory ${input.slug}: ${readErr.message}`)
  const ownerApp = ((existing?.app_slug as HtmlStoryApp | null | undefined) ?? DEFAULT_HTML_STORY_APP)
  if (existing && ownerApp !== app) throw new HtmlStorySlugTakenError(input.slug, ownerApp)

  const meta = extractHtmlMeta(input.html)
  const theme = extractThemeMeta(input.html)
  const status: HtmlStoryStatus = input.status ?? existing?.status ?? 'draft'
  const now = new Date().toISOString()
  const row = {
    slug: input.slug,
    app_slug: app,
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
  app: HtmlStoryApp = DEFAULT_HTML_STORY_APP,
): Promise<HtmlStorySummary | null> {
  const sb = createServiceClient()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) update.title = patch.title
  if (patch.description !== undefined) update.description = patch.description
  if (patch.ogImageUrl !== undefined) update.og_image_url = patch.ogImageUrl
  if (patch.status !== undefined) {
    update.status = patch.status
    if (patch.status === 'published') {
      const { data: cur } = await sb
        .from('html_stories')
        .select('published_at')
        .eq('slug', slug)
        .eq('app_slug', app)
        .maybeSingle()
      if (cur && !cur.published_at) update.published_at = update.updated_at
    }
  }
  if (patch.aura !== undefined) update.aura = patch.aura
  const run = (cols: string) =>
    sb.from('html_stories').update(update).eq('slug', slug).eq('app_slug', app).select(cols).maybeSingle()
  let { data, error } = await run(SUMMARY_COLUMNS)
  if (isMissingColumn(error)) {
    if (patch.aura !== undefined) throw new Error(`${AURA_MIGRATION_HINT} (${slug})`)
    ;({ data, error } = await run(BASE_COLUMNS))
  }
  if (error) throw new Error(`updateHtmlStoryMeta ${slug}: ${error.message}`)
  return data ? mapSummary(data) : null
}

export async function deleteHtmlStory(slug: string, app: HtmlStoryApp = DEFAULT_HTML_STORY_APP): Promise<void> {
  const { error } = await createServiceClient().from('html_stories').delete().eq('slug', slug).eq('app_slug', app)
  if (error) throw new Error(`deleteHtmlStory ${slug}: ${error.message}`)
}

/** Which app owns a slug, or null when no story has it. */
export async function getHtmlStoryApp(slug: string): Promise<HtmlStoryApp | null> {
  const { data, error } = await createServiceClient()
    .from('html_stories')
    .select('app_slug')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(`getHtmlStoryApp ${slug}: ${error.message}`)
  if (!data) return null
  return (data.app_slug as HtmlStoryApp | null) ?? DEFAULT_HTML_STORY_APP
}

/**
 * A story's version history. Versions hang off the slug, which is global, so
 * pass `app` to get [] for a slug another app owns (the admin routes do).
 */
export async function listHtmlStoryVersions(
  slug: string,
  limit = 50,
  app?: HtmlStoryApp,
): Promise<HtmlStoryVersion[]> {
  if (app && (await getHtmlStoryApp(slug)) !== app) return []
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

export async function getHtmlStoryVersionHtml(
  slug: string,
  id: number,
  app?: HtmlStoryApp,
): Promise<string | null> {
  if (app && (await getHtmlStoryApp(slug)) !== app) return null
  const { data, error } = await createServiceClient()
    .from('html_story_versions')
    .select('html')
    .eq('slug', slug)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getHtmlStoryVersionHtml ${slug}#${id}: ${error.message}`)
  return (data?.html as string | undefined) ?? null
}
