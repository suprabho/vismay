/**
 * Editorial story access for Footshort's Editorial mode.
 *
 * Footshort reads vizmaya.fyi's `stories` table directly via the shared
 * Supabase project's anon client. RLS on the stories table already filters
 * to (status='published' AND listed=true). This module only exposes read
 * paths; writes live in vizmaya.fyi's admin.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import matter from 'gray-matter'

/** Mirrors the `status` enum on Vizmaya's `stories` table. */
export type EditorialStoryStatus = 'draft' | 'published' | 'archived'

/**
 * Minimum metadata Footshort renders in the Editorial feed. `subtitle`,
 * `byline`, and `themeAccent` come from each row's YAML frontmatter — they
 * live in the markdown blob, not as separate columns. Cheap to parse client-
 * side for the ≤24 rows shown in the magazine grid.
 */
export interface EditorialStorySummary {
  slug: string
  title: string
  subtitle: string | null
  byline: string | null
  /** Hex like "#d8804a" pulled from frontmatter.theme.colors.accent. */
  themeAccent: string | null
  status: EditorialStoryStatus
  listed: boolean
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

function parseFrontmatter(markdown: string | null): {
  subtitle: string | null
  byline: string | null
  themeAccent: string | null
} {
  if (!markdown) return { subtitle: null, byline: null, themeAccent: null }
  try {
    const parsed = matter(markdown)
    const fm = parsed.data as Record<string, unknown>
    const theme = (fm.theme as Record<string, unknown> | undefined)?.colors as
      | Record<string, unknown>
      | undefined
    const accent = theme?.accent
    return {
      subtitle: typeof fm.subtitle === 'string' ? fm.subtitle : null,
      byline: typeof fm.byline === 'string' ? fm.byline : null,
      themeAccent: typeof accent === 'string' ? accent : null,
    }
  } catch {
    return { subtitle: null, byline: null, themeAccent: null }
  }
}

/**
 * Pulls listed, published stories newest-first. Hidden/draft/archived rows
 * never leak to Footshort. Returns an empty list on error rather than
 * throwing so the Editorial feed can render an empty state instead of
 * crashing the app.
 *
 * Selects the `markdown` column to extract frontmatter; the body's size is
 * dominated by the story itself, ~50–100 KB per row. For ≤24 rows that's
 * ~2 MB worst-case. If this becomes a bottleneck, the optimization is a
 * Postgres view or generated columns on vizmaya's side that denormalize the
 * frontmatter fields.
 */
export async function fetchEditorialStories(
  client: SupabaseClient,
  opts: FetchEditorialStoriesOptions = {}
): Promise<EditorialStorySummary[]> {
  const { limit = 24, before } = opts
  let query = client
    .from('stories')
    .select('slug, title, status, listed, markdown, published_at, updated_at, created_at')
    .eq('status', 'published')
    .eq('listed', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (before) query = query.lt('published_at', before)

  const { data, error } = await query
  if (error || !data) return []

  return data.map((row) => {
    const fm = parseFrontmatter(row.markdown)
    return {
      slug: row.slug,
      title: row.title,
      subtitle: fm.subtitle,
      byline: fm.byline,
      themeAccent: fm.themeAccent,
      status: row.status as EditorialStoryStatus,
      listed: row.listed,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    }
  })
}

/** Fetches a single story by slug. Used by the reader screen. */
export async function fetchEditorialStory(
  client: SupabaseClient,
  slug: string
): Promise<EditorialStoryFull | null> {
  const { data, error } = await client
    .from('stories')
    .select('slug, title, status, listed, markdown, config_yaml, share_yaml, published_at, updated_at, created_at')
    .eq('slug', slug)
    .eq('status', 'published')
    .eq('listed', true)
    .maybeSingle()

  if (error || !data) return null

  const fm = parseFrontmatter(data.markdown)
  return {
    slug: data.slug,
    title: data.title,
    subtitle: fm.subtitle,
    byline: fm.byline,
    themeAccent: fm.themeAccent,
    status: data.status as EditorialStoryStatus,
    listed: data.listed,
    markdown: data.markdown,
    configYaml: data.config_yaml,
    shareYaml: data.share_yaml,
    publishedAt: data.published_at,
    updatedAt: data.updated_at,
    createdAt: data.created_at,
  }
}

/** Shared query-key namespace so callers' TanStack Query caches don't collide. */
export const EDITORIAL_QUERY_KEYS = {
  all: ['editorial'] as const,
  stories: (opts?: FetchEditorialStoriesOptions) =>
    ['editorial', 'stories', opts ?? {}] as const,
  story: (slug: string) => ['editorial', 'story', slug] as const,
}
