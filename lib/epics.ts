/**
 * Server-side read helpers for the epics data model.
 *
 * An epic is a topic collection (IEA, Epstein, …) that has a bespoke landing
 * page and a curated set of vizmaya stories. Tables: `epics`, `story_epics`,
 * plus per-epic data tables like `iea_news` / `iea_countries`.
 *
 * Schema: supabase/migrations/015_epics_iea.sql
 */

import { createServiceClient } from './supabase'

export interface Epic {
  slug: string
  name: string
  description: string | null
  landingComponent: string
}

export async function getEpic(slug: string): Promise<Epic | null> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('epics')
    .select('slug, name, description, landing_component')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  if (error) throw new Error(`getEpic ${slug}: ${error.message}`)
  if (!data) return null
  return {
    slug: data.slug,
    name: data.name,
    description: data.description,
    landingComponent: data.landing_component,
  }
}

export interface EpicStory {
  slug: string
  title: string
  position: number | null
}

export async function getEpicStories(epicSlug: string): Promise<EpicStory[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('story_epics')
    .select('position, stories!inner(slug, title, status)')
    .eq('epic_slug', epicSlug)
    .order('position', { ascending: true, nullsFirst: false })
  if (error) throw new Error(`getEpicStories ${epicSlug}: ${error.message}`)
  // Supabase's join shape can be either a single row or an array depending on
  // the FK direction; normalise to a single object before reading fields.
  return (data ?? [])
    .map((r: any) => ({
      ...r,
      story: Array.isArray(r.stories) ? r.stories[0] : r.stories,
    }))
    .filter((r) => r.story?.status === 'published')
    .map((r) => ({
      slug: r.story.slug as string,
      title: r.story.title as string,
      position: r.position as number | null,
    }))
}

// ---------------------------------------------------------------------------
// IEA-specific reads.

export interface IeaNewsItem {
  id: number
  url: string
  title: string
  summary: string | null
  publishedAt: string
  countryCodes: string[]
  topics: string[]
}

export async function getIeaNewsSince(daysAgo: number): Promise<IeaNewsItem[]> {
  const sb = createServiceClient()
  const since = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await sb
    .from('iea_news')
    .select('id, source_url, title, summary, published_at, country_codes, topics')
    .gte('published_at', since)
    .order('published_at', { ascending: false })
  if (error) throw new Error(`getIeaNewsSince: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    id: r.id as number,
    url: r.source_url as string,
    title: r.title as string,
    summary: r.summary as string | null,
    publishedAt: r.published_at as string,
    countryCodes: (r.country_codes as string[]) ?? [],
    topics: (r.topics as string[]) ?? [],
  }))
}

export interface IeaCountry {
  code: string
  name: string
  lat: number
  lng: number
  summary: string | null
}

export async function getIeaCountries(): Promise<IeaCountry[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('iea_countries')
    .select('code, name, lat, lng, summary')
    .order('name', { ascending: true })
  if (error) throw new Error(`getIeaCountries: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    code: r.code as string,
    name: r.name as string,
    lat: r.lat as number,
    lng: r.lng as number,
    summary: r.summary as string | null,
  }))
}
