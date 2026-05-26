/**
 * Editorial story access for Footshorts's Editorial mode.
 *
 * Footshorts reads vizmaya.fyi's `stories` table directly via an anonymous
 * Supabase client pointed at Vizmaya's project. Footshorts's own Supabase is
 * unrelated — the two products use separate databases and keep them that way.
 * This module only exposes read paths; writes live in vizmaya.fyi's admin.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Mirrors the `status` enum on Vizmaya's `stories` table. */
export type EditorialStoryStatus = 'draft' | 'published' | 'archived'

/**
 * Minimum metadata Footshorts renders in the Editorial feed. We deliberately
 * skip `markdown` here — list views don't need the full body. Pull the body
 * lazily on the reader screen.
 */
export interface EditorialStorySummary {
  slug: string
  title: string
  status: EditorialStoryStatus
  listed: boolean
  /** aura.promad.design embed slug used as the card background, or null. */
  aura: string | null
  publishedAt: string | null
  updatedAt: string
  createdAt: string
}

/** Full row including markdown + YAML configs. Hit only when opening the reader. */
export interface EditorialStoryFull extends EditorialStorySummary {
  markdown: string
  configYaml: string | null
  shareYaml: string | null
}

export interface FetchEditorialStoriesOptions {
  /** Max rows to return. Defaults to 24 — enough for a magazine hero+grid. */
  limit?: number
  /** Cursor by `published_at` for paging older stories. */
  before?: string
}

/**
 * Pulls listed, published stories newest-first. Hidden/draft/archived rows
 * never leak to Footshorts. Returns null on error rather than throwing so the
 * Editorial feed can render an empty state instead of crashing the app.
 */
export async function fetchEditorialStories(
  client: SupabaseClient,
  opts: FetchEditorialStoriesOptions = {}
): Promise<EditorialStorySummary[]> {
  const { limit = 24, before } = opts
  const build = (cols: string) => {
    let query = client
      .from('stories')
      .select(cols)
      .eq('status', 'published')
      .eq('listed', true)
      .eq('app_slug', 'footshorts')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit)
    if (before) query = query.lt('published_at', before)
    return query
  }

  const AURA_COLS = 'slug, title, status, listed, aura, published_at, updated_at, created_at'
  const BASE_COLS = 'slug, title, status, listed, published_at, updated_at, created_at'

  let { data, error } = await build(AURA_COLS)
  // Degrade gracefully on databases that predate migration 044 (no `aura`
  // column) rather than returning an empty feed on the column-missing error.
  if (error?.message?.includes('aura')) ({ data, error } = await build(BASE_COLS))
  if (error || !data) return []

  type Row = {
    slug: string
    title: string
    status: string
    listed: boolean
    aura?: string | null
    published_at: string | null
    updated_at: string
    created_at: string
  }
  return (data as unknown as Row[]).map((row) => ({
    slug: row.slug,
    title: row.title,
    status: row.status as EditorialStoryStatus,
    listed: row.listed,
    aura: row.aura ?? null,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  }))
}

/** Fetches a single story by slug. Used by the reader screen. */
export async function fetchEditorialStory(
  client: SupabaseClient,
  slug: string
): Promise<EditorialStoryFull | null> {
  const { data, error } = await client
    .from('stories')
    .select('slug, title, status, listed, aura, markdown, config_yaml, share_yaml, published_at, updated_at, created_at')
    .eq('slug', slug)
    .eq('status', 'published')
    .eq('listed', true)
    .eq('app_slug', 'footshorts')
    .maybeSingle()

  if (error || !data) return null

  return {
    slug: data.slug,
    title: data.title,
    status: data.status as EditorialStoryStatus,
    listed: data.listed,
    aura: data.aura ?? null,
    markdown: data.markdown,
    configYaml: data.config_yaml,
    shareYaml: data.share_yaml,
    publishedAt: data.published_at,
    updatedAt: data.updated_at,
    createdAt: data.created_at,
  }
}

// ---------------------------------------------------------------------------
// Epics: topic collections the Footshorts admin assigns to the 'footshorts' app.
// Vizmaya's epic landing components are bespoke React per slug, so Footshorts
// can't iframe them — it renders a native generic landing instead (name +
// description + the epic's member stories). See app/editorial/epic/[slug].

export interface EditorialEpicSummary {
  slug: string
  name: string
  description: string | null
}

export interface EditorialEpicWithStories extends EditorialEpicSummary {
  // Discriminator that picks the landing UI. 'generic' (or unknown) renders the
  // default story grid; bespoke values (e.g. 'fifa-wc26') render a custom map
  // landing. Mirrors vizmaya's `epics.landing_component`.
  landingComponent: string
  // Epic palette JSON, edited in the admin theme editor. Bespoke landings
  // resolve their own typed theme from it; the generic grid ignores it.
  theme: Record<string, unknown>
  stories: EditorialStorySummary[]
}

/** Lists Footshorts-tagged published epics, A→Z by name. */
export async function fetchEditorialEpics(
  client: SupabaseClient,
): Promise<EditorialEpicSummary[]> {
  const { data, error } = await client
    .from('epics')
    .select('slug, name, description')
    .eq('status', 'published')
    .eq('app_slug', 'footshorts')
    .order('name', { ascending: true })

  if (error || !data) return []
  return data.map((row) => ({
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
  }))
}

/**
 * Fetches one Footshorts epic plus its member stories (ordered by
 * `story_epics.position`, then by `published_at` for ties). Member stories
 * are filtered the same way as the main feed: published, listed, and
 * `app_slug='footshorts'` — an epic membership alone doesn't bypass those
 * checks if the story belongs to a different app.
 */
export async function fetchEditorialEpic(
  client: SupabaseClient,
  slug: string,
): Promise<EditorialEpicWithStories | null> {
  const { data: epic, error: epicErr } = await client
    .from('epics')
    .select('slug, name, description, landing_component, theme')
    .eq('slug', slug)
    .eq('status', 'published')
    .eq('app_slug', 'footshorts')
    .maybeSingle()

  if (epicErr || !epic) return null

  const base = {
    slug: epic.slug as string,
    name: epic.name as string,
    description: (epic.description as string | null) ?? null,
    landingComponent: (epic.landing_component as string | null) ?? 'generic',
    theme: (epic.theme as Record<string, unknown> | null) ?? {},
  }

  // Two-step read because Supabase JS can't filter the joined `stories`
  // table by `app_slug` directly in the same select without resorting to
  // an RPC. Pull memberships first, then hydrate the stories the feed
  // would have shown anyway.
  const { data: memberships, error: memErr } = await client
    .from('story_epics')
    .select('story_slug, position')
    .eq('epic_slug', slug)
    .order('position', { ascending: true, nullsFirst: false })

  if (memErr || !memberships || memberships.length === 0) {
    return { ...base, stories: [] }
  }

  const storySlugs = memberships.map((m) => m.story_slug as string)
  const { data: storyRows, error: storyErr } = await client
    .from('stories')
    .select('slug, title, status, listed, aura, published_at, updated_at, created_at')
    .in('slug', storySlugs)
    .eq('status', 'published')
    .eq('listed', true)
    .eq('app_slug', 'footshorts')

  if (storyErr || !storyRows) {
    return { ...base, stories: [] }
  }

  // Re-order in the membership order. Stories that didn't survive the
  // Footshorts/listed/published filter just drop out.
  const bySlug = new Map(storyRows.map((r) => [r.slug as string, r]))
  const stories: EditorialStorySummary[] = []
  for (const m of memberships) {
    const r = bySlug.get(m.story_slug as string)
    if (!r) continue
    stories.push({
      slug: r.slug,
      title: r.title,
      status: r.status as EditorialStoryStatus,
      listed: r.listed,
      aura: r.aura ?? null,
      publishedAt: r.published_at,
      updatedAt: r.updated_at,
      createdAt: r.created_at,
    })
  }

  return { ...base, stories }
}

/** Shared query-key namespace so callers' TanStack Query caches don't collide. */
export const EDITORIAL_QUERY_KEYS = {
  all: ['editorial'] as const,
  stories: (opts?: FetchEditorialStoriesOptions) =>
    ['editorial', 'stories', opts ?? {}] as const,
  story: (slug: string) => ['editorial', 'story', slug] as const,
  epics: () => ['editorial', 'epics'] as const,
  epic: (slug: string) => ['editorial', 'epic', slug] as const,
}
