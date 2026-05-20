/**
 * Editorial story access for Footshort's Editorial mode.
 *
 * Footshort reads vizmaya.fyi's `stories` table directly via an anonymous
 * Supabase client pointed at Vizmaya's project. Footshort's own Supabase is
 * unrelated — the two products use separate databases and keep them that way.
 * This module only exposes read paths; writes live in vizmaya.fyi's admin.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Mirrors the `status` enum on Vizmaya's `stories` table. */
export type EditorialStoryStatus = 'draft' | 'published' | 'archived'

/**
 * Minimum metadata Footshort renders in the Editorial feed. We deliberately
 * skip `markdown` here — list views don't need the full body. Pull the body
 * lazily on the reader screen.
 */
export interface EditorialStorySummary {
  slug: string
  title: string
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

/**
 * Pulls listed, published stories newest-first. Hidden/draft/archived rows
 * never leak to Footshort. Returns null on error rather than throwing so the
 * Editorial feed can render an empty state instead of crashing the app.
 */
export async function fetchEditorialStories(
  client: SupabaseClient,
  opts: FetchEditorialStoriesOptions = {}
): Promise<EditorialStorySummary[]> {
  const { limit = 24, before } = opts
  let query = client
    .from('stories')
    .select('slug, title, status, listed, published_at, updated_at, created_at')
    .eq('status', 'published')
    .eq('listed', true)
    .eq('app_slug', 'footshort')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (before) query = query.lt('published_at', before)

  const { data, error } = await query
  if (error || !data) return []

  return data.map((row) => ({
    slug: row.slug,
    title: row.title,
    status: row.status as EditorialStoryStatus,
    listed: row.listed,
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
    .select('slug, title, status, listed, markdown, config_yaml, share_yaml, published_at, updated_at, created_at')
    .eq('slug', slug)
    .eq('status', 'published')
    .eq('listed', true)
    .eq('app_slug', 'footshort')
    .maybeSingle()

  if (error || !data) return null

  return {
    slug: data.slug,
    title: data.title,
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
