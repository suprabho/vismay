/**
 * GET /api/html-stories/brief on each hosting site: the agent brief as plain
 * markdown, so any agent with web access can be told "read
 * <site>/api/html-stories/brief and write a story about X". Public on purpose:
 * the generic brief holds no secrets (the publish token is the user's).
 *
 * Query:
 *   - `style=random` swaps the house style for a palette and font trio drawn
 *     from the app's published viz-engine stories (./styles); falls back to the
 *     house style if the stories can't be read.
 *   - footshorts only: `fixtures=<id>,<id>` (up to MAX_CONTEXT_MATCHES) appends
 *     the match context for those matches (./footshortsBrief), with an optional
 *     `prompt`. The context is read from the match tables with the service
 *     client, so this variant wants the same bearer token as publishing — the
 *     MCP server and admin send it; the plain brief stays public.
 *
 * Server only.
 */

import type { HtmlStoryApp } from './apps'
import { htmlStoryBrief } from './brief'
import { footshortsHtmlStoryBrief, MAX_CONTEXT_MATCHES } from './footshortsBrief'
import { HTML_STORIES_TOKEN_ENV, isHtmlStoriesTokenRequest } from './publishApi'
import { loadStoryStylePool } from './storyStyles'
import { pickRandomStyle, type StoryStyle } from './styles'

/** Fixture ids as the picker sends them: a comma list, or repeated params. */
export function parseFixtureIds(params: URLSearchParams): string[] {
  const ids = params
    .getAll('fixtures')
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean)
  return Array.from(new Set(ids))
}

export async function handleHtmlStoryBriefRequest(req: Request, app: HtmlStoryApp): Promise<Response> {
  const url = new URL(req.url)
  const random = url.searchParams.get('style') === 'random'
  const fixtureIds = app === 'footshorts' ? parseFixtureIds(url.searchParams) : []

  if (fixtureIds.length > MAX_CONTEXT_MATCHES) {
    return new Response(`at most ${MAX_CONTEXT_MATCHES} matches per brief`, { status: 400 })
  }
  if (fixtureIds.length && !isHtmlStoriesTokenRequest(req)) {
    const why = process.env[HTML_STORIES_TOKEN_ENV]
      ? 'the match context needs Authorization: Bearer $HTML_STORIES_TOKEN'
      : `the match context needs ${HTML_STORIES_TOKEN_ENV} configured on this deployment`
    return new Response(why, { status: 401 })
  }

  let style: StoryStyle | null = null
  if (random) {
    try {
      style = pickRandomStyle(await loadStoryStylePool(app))
    } catch (e) {
      console.error('[html-stories/brief] style pool failed', e)
    }
  }

  let brief: string
  try {
    brief =
      app === 'footshorts'
        ? await footshortsHtmlStoryBrief({
            siteUrl: url.origin,
            style,
            fixtureIds,
            prompt: url.searchParams.get('prompt')?.trim() || undefined,
          })
        : htmlStoryBrief({ app, siteUrl: url.origin, style })
  } catch (e) {
    return new Response(`match context failed: ${e instanceof Error ? e.message : String(e)}`, { status: 502 })
  }

  return new Response(brief, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      // A random or match-specific brief must differ per request; the house brief is cacheable.
      'cache-control': random || fixtureIds.length ? 'no-store' : 'public, s-maxage=3600',
    },
  })
}
