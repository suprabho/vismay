/**
 * Server-side read helpers for the apps lookup table.
 *
 * Schema: supabase/migrations/039_content_apps.sql
 */

import { createServiceClient } from './supabase'

export type AppStatus = 'active' | 'archived'

export interface App {
  slug: string
  name: string
  status: AppStatus
}

export interface AppWithCounts extends App {
  epicCount: number
  storyCount: number
}

export interface AppEpic {
  slug: string
  name: string
  status: string
}

export interface AppStory {
  slug: string
  title: string
  status: string
}

export async function listApps(): Promise<App[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('apps')
    .select('slug, name, status')
    .order('name', { ascending: true })
  if (error) throw new Error(`listApps: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    slug: r.slug as string,
    name: r.name as string,
    status: r.status as AppStatus,
  }))
}

export async function getApp(slug: string): Promise<App | null> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('apps')
    .select('slug, name, status')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(`getApp ${slug}: ${error.message}`)
  if (!data) return null
  return { slug: data.slug, name: data.name, status: data.status as AppStatus }
}

export async function listAppsWithCounts(): Promise<AppWithCounts[]> {
  const sb = createServiceClient()
  const [appsR, epicsR, storiesR] = await Promise.all([
    sb.from('apps').select('slug, name, status').order('name', { ascending: true }),
    sb.from('epics').select('app_slug'),
    sb.from('stories').select('app_slug'),
  ])
  if (appsR.error) throw new Error(`listAppsWithCounts apps: ${appsR.error.message}`)
  if (epicsR.error) throw new Error(`listAppsWithCounts epics: ${epicsR.error.message}`)
  if (storiesR.error) throw new Error(`listAppsWithCounts stories: ${storiesR.error.message}`)

  const epicCounts = new Map<string, number>()
  for (const r of (epicsR.data ?? []) as { app_slug: string }[]) {
    epicCounts.set(r.app_slug, (epicCounts.get(r.app_slug) ?? 0) + 1)
  }
  const storyCounts = new Map<string, number>()
  for (const r of (storiesR.data ?? []) as { app_slug: string }[]) {
    storyCounts.set(r.app_slug, (storyCounts.get(r.app_slug) ?? 0) + 1)
  }

  return ((appsR.data ?? []) as { slug: string; name: string; status: AppStatus }[]).map((r) => ({
    slug: r.slug,
    name: r.name,
    status: r.status,
    epicCount: epicCounts.get(r.slug) ?? 0,
    storyCount: storyCounts.get(r.slug) ?? 0,
  }))
}

export async function listAppEpics(appSlug: string): Promise<AppEpic[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('epics')
    .select('slug, name, status')
    .eq('app_slug', appSlug)
    .order('name', { ascending: true })
  if (error) throw new Error(`listAppEpics ${appSlug}: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    slug: r.slug as string,
    name: r.name as string,
    status: r.status as string,
  }))
}

export async function listAppStories(appSlug: string): Promise<AppStory[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('stories')
    .select('slug, title, status')
    .eq('app_slug', appSlug)
    .order('title', { ascending: true })
  if (error) throw new Error(`listAppStories ${appSlug}: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    slug: r.slug as string,
    title: (r.title as string | null) ?? (r.slug as string),
    status: r.status as string,
  }))
}

export async function setStoryApp(storySlug: string, appSlug: string): Promise<void> {
  const sb = createServiceClient()
  const { error } = await sb
    .from('stories')
    .update({ app_slug: appSlug, updated_at: new Date().toISOString() })
    .eq('slug', storySlug)
  if (error) throw new Error(`setStoryApp ${storySlug}: ${error.message}`)
}
