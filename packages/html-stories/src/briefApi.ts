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
 *   - vizmaya only: `spin=<id>` renders the brief for a logged randomizer spin
 *     (@vismay/randomizer): its assignment, research protocol, format and
 *     research file. Read-only on purpose: spins are created by the
 *     authenticated spin endpoint, never here, so the public URL cannot fill
 *     the log the repeat blocks read. Spin ids are random uuids.
 *
 * Server only.
 */

import type { HtmlStoryApp } from './apps'
import { htmlStoryBrief } from './brief'
import { footshortsHtmlStoryBrief, MAX_CONTEXT_MATCHES } from './footshortsBrief'
import { getSpin, isSpinId } from '@vismay/randomizer/spins'
import type { SpinRecord } from '@vismay/randomizer/types'
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
  const spinId = url.searchParams.get('spin')?.trim() || null

  let spin: SpinRecord | null = null
  if (spinId) {
    if (app !== 'vizmaya-fyi') return new Response('randomizer spins are vizmaya stories', { status: 400 })
    if (!isSpinId(spinId)) return new Response('spin must be a spin id', { status: 400 })
    try {
      spin = await getSpin(spinId)
    } catch (e) {
      return new Response(`spin lookup failed: ${e instanceof Error ? e.message : String(e)}`, { status: 502 })
    }
    if (!spin) return new Response(`no spin ${spinId}`, { status: 404 })
  }

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
        : htmlStoryBrief({ app, siteUrl: url.origin, style, spin })
  } catch (e) {
    return new Response(`match context failed: ${e instanceof Error ? e.message : String(e)}`, { status: 502 })
  }

  return new Response(brief, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      // A random, match-specific or spin brief must differ per request; the house brief is cacheable.
      'cache-control': random || fixtureIds.length || spin ? 'no-store' : 'public, s-maxage=3600',
    },
  })
}
