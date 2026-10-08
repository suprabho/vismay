/**
 * The apps that host agent-authored HTML stories. One `html_stories` table
 * serves them all (footshorts, vizf1, viznba and vizmaya.fyi share a Supabase project); the
 * `app_slug` column (migration 085) says which site a row belongs to, and
 * every reader/writer in ./htmlStories scopes by it.
 *
 * Pure — no Supabase / Node imports — so client components, the MCP server
 * and the brief can all use it.
 */

export type HtmlStoryApp = 'vizmaya-fyi' | 'footshorts' | 'vizf1' | 'viznba'

export const HTML_STORY_APPS: readonly HtmlStoryApp[] = ['vizmaya-fyi', 'footshorts', 'vizf1', 'viznba']

/** Rows written before app scoping existed carry this (the column default). */
export const DEFAULT_HTML_STORY_APP: HtmlStoryApp = 'vizmaya-fyi'

export interface HtmlStoryAppMeta {
  slug: HtmlStoryApp
  /** How the site names itself in the brief and the chrome. */
  name: string
  /** Production origin; deployments override it with their own request origin. */
  siteUrl: string
  /** The byline the brief asks for. */
  desk: string
  /** Where the site lists its stories, for the chrome's "all stories" link. */
  storiesPath: string
  /** The link's label. */
  storiesLabel: string
}

export const HTML_STORY_APP_META: Record<HtmlStoryApp, HtmlStoryAppMeta> = {
  'vizmaya-fyi': {
    slug: 'vizmaya-fyi',
    name: 'vizmaya',
    siteUrl: 'https://vizmaya.fyi',
    desk: 'vizmaya desk',
    storiesPath: '/stories',
    storiesLabel: 'All stories',
  },
  footshorts: {
    slug: 'footshorts',
    name: 'Footshorts',
    siteUrl: 'https://footshorts.com',
    desk: 'footshorts desk',
    storiesPath: '/feed?tab=editorial',
    storiesLabel: 'Editorial',
  },
  vizf1: {
    slug: 'vizf1',
    name: 'VizF1',
    // www is canonical: the apex redirects without CORS headers.
    siteUrl: 'https://www.vizf1.com',
    desk: 'VizF1 desk',
    storiesPath: '/editorial',
    storiesLabel: 'Editorial',
  },
  viznba: {
    slug: 'viznba',
    name: 'VizNBA',
    siteUrl: 'https://nba.vizmaya.fyi',
    desk: 'VizNBA desk',
    storiesPath: '/editorial',
    storiesLabel: 'Editorial',
  },
}

export function isHtmlStoryApp(value: unknown): value is HtmlStoryApp {
  return typeof value === 'string' && (HTML_STORY_APPS as readonly string[]).includes(value)
}

/** The app an `app` query/body value names, or the default when it is absent. Null when it names an unknown app. */
export function parseHtmlStoryApp(value: unknown): HtmlStoryApp | null {
  if (value == null || value === '') return DEFAULT_HTML_STORY_APP
  return isHtmlStoryApp(value) ? value : null
}
