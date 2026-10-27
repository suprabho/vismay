/**
 * Tools: `get_html_story_brief`, `publish_html_story`, and the story's media:
 * `save_story_image` and `generate_story_image`.
 *
 * The agent-authored HTML story pipeline (packages/html-stories): the agent
 * reads the brief, writes one self-contained HTML page, and publishes it to
 * <site>/s/<slug> through the token-gated publish API. Five sites host them —
 * vizmaya.fyi (the default), footshorts.com, vizf1.com, viznba and travel —
 * chosen with `app`.
 * Pure HTTP to the deployed site, so no dev server is needed.
 *
 * A footshorts brief can carry a MATCH CONTEXT: pass `fixtureIds` (up to 40 footshorts
 * fixture uuids, from the admin HTML stories tab's match picker or a
 * footshorts.com/match/<id> URL) and the site appends everything its match
 * tables know — Opta facts and the full stat set, the timeline, insights,
 * commentary, the build-up, both sides' form and schedule, the table and the
 * competition's next fixtures. That variant needs the publish token.
 *
 * A vizf1 brief can carry a RACE CONTEXT the same way: pass `sessionKeys` (up to
 * 24 telemetry session keys — races, sprints, qualifying, practice, across
 * weekends and seasons, e.g. `2026_australian_grand_prix_R`) and optionally
 * `drivers` (up to 8 codes like VER, or car numbers) and the site appends the
 * classifications, lap-by-lap timing, sectors and speed traps, strategy, key
 * moments, the drivers' head-to-head across every session, and the
 * championship standings round by round. Also token-gated.
 *
 * A viznba brief can carry a GAME CONTEXT: pass `gameIds` (up to 12 ESPN event
 * ids) and the site appends each game's box score from ESPN. Also token-gated.
 *
 * A travel brief can carry a TRIP CONTEXT: pass `tripSlug` (and optionally
 * `day`) and the site appends the itinerary stop by stop and the trip's
 * curated photos and clips with their URLs. Also token-gated: a trip is
 * private, and so is every travel story (served only to people with the
 * trip's password; the page must carry <meta name="travel:trip">).
 *
 * A vizmaya, footshorts or viznba brief can carry a randomizer spin instead
 * (`spinId`, from `spin_randomizer` in ./randomizer): the assignment,
 * research protocol, output format and research file for that spin (a
 * Football Desk spin's also carries its fixtures' match context, an NBA Desk
 * spin's its games' box scores). Publishing
 * with the same `spinId` ties the page to the spin.
 *
 * Any brief can be for a STORY FORMAT (`format`): a scrolling page (the
 * default), a book, a pinned board, a deck, or (vizf1) a race recap. These
 * run on a runtime the site hosts (packages/html-stories/formats), so the
 * brief says how to load it and write pages, board items, slides or chapters
 * for it.
 *
 * Photos, video and AI illustrations go to the site's assets endpoint
 * (packages/html-stories/src/assetsApi.ts) under the story's slug, with the
 * same publish token, so the page links to files on our own storage.
 */

import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { htmlStoryBrief } from '@vismay/html-stories/brief'
import { AUTHORABLE_HTML_STORY_FORMATS } from '@vismay/html-stories/formats'
import { HTML_STORY_TONES } from '@vismay/html-stories/tone'
import {
  htmlStoriesToken,
  htmlStoriesUrlFor,
  requireHtmlStoriesEnv,
  type HtmlStoryApp,
  type VismayMcpConfig,
} from '../config.js'

const appSchema = z
  .enum(['vizmaya-fyi', 'footshorts', 'vizf1', 'viznba', 'travel'])
  .default('vizmaya-fyi')
  .describe(
    'Which site hosts the story: vizmaya.fyi (default), footshorts.com, vizf1.com, viznba, or travel (the trips site; ' +
      'each story private to one trip).',
  )

export function registerHtmlStoryTools(server: McpServer, config: VismayMcpConfig): void {
  server.registerTool(
    'get_html_story_brief',
    {
      title: 'Get the HTML story brief',
      description:
        'Read this before writing a vizmaya, footshorts, vizf1, viznba or travel HTML story. It covers the hosting ' +
        'contract (one self-contained HTML file), the site\'s house design direction, chart ' +
        'rules, a self-check list, and how to publish. Pass randomStyle=true to swap the house ' +
        'style for a palette and fonts drawn at random from the site\'s existing stories (footshorts: or pass ' +
        'competitionStyle=<competition slug> or teamStyle=<team slug> for its own palette and fonts). For ' +
        'footshorts, pass fixtureIds (up to 40 fixture ids) to append the match context — Opta ' +
        'facts, timeline, insights, commentary, schedules and the table — the story must be ' +
        'written from, plus an optional editorial prompt. For vizf1, pass sessionKeys (up to 24 telemetry ' +
        'session keys, e.g. 2026_australian_grand_prix_R, across races and seasons) and optionally drivers ' +
        '(up to 8 codes such as VER) to append the race context: classifications, lap-by-lap timing, sectors, ' +
        'speed traps, strategy, the head-to-head across sessions and the standings round by round. ' +
        'For viznba, pass gameIds (up to 12 ESPN event ids, as in viznba\'s /game/<id> URLs) to append the game ' +
        'context: each game\'s box score from ESPN (quarters, team stats, every player\'s line, runs, leaders, recap; ' +
        'for a game ahead the records, form, injury report and win probability). ' +
        'For travel, pass tripSlug (e.g. new-york-2026) and optionally day to append the trip context: the ' +
        'itinerary stop by stop and the curated photos and clips with their URLs. ' +
        'For a randomizer spin, pass spinId (from spin_randomizer) with the spin\'s app (vizmaya-fyi for desk, ' +
        'atlas and epics; footshorts for the Football Desk; viznba for the NBA Desk) to get its assignment, research ' +
        'protocol, output format and research file; a Football Desk spin\'s brief also carries the match context of ' +
        'its fixtures, an NBA Desk spin\'s the box scores of its games. ' +
        'Pass format to write something other than a scrolling page: "book" (pages the reader turns; ' +
        'suits a chronology or a journey), "board" (a pinned board with a guided camera tour; suits a ' +
        'case built from many connected pieces), "deck" (slides or a stack of cards; suits an argument ' +
        'made one point at a time), ' +
        '"collage" (a cut-out collage: torn-paper pieces on a kraft board, cut-paper ' +
        'charts and a stamp on each claim, choreographed in stop-motion as the page scrolls; suits places, objects ' +
        'or claims laid side by side) or, for vizf1 with a race in sessionKeys, "recap" (chapters the reader ' +
        'scrolls while the 3D race replay beside them jumps to each moment; suits a race told through its moments). ' +
        'Pass tone="humorous" for a wry, a little sarcastic voice (the facts stay exact).',
      inputSchema: {
        app: appSchema,
        randomStyle: z
          .boolean()
          .default(false)
          .describe('Use a random palette + font trio from an existing story instead of the house style.'),
        competitionStyle: z
          .string()
          .regex(/^[a-z0-9-]{1,80}$/)
          .optional()
          .describe(
            'footshorts only: a competition slug (e.g. premier-league, champions-league) whose palette and fonts, ' +
              'set in the Asset Studio, replace the house style. Wins over randomStyle.',
          ),
        teamStyle: z
          .string()
          .regex(/^[a-z0-9-]{1,80}$/)
          .optional()
          .describe(
            'footshorts only: a team slug (e.g. arsenal) whose palette and fonts, set in the Asset Studio, ' +
              'replace the house style. Wins over competitionStyle and randomStyle.',
          ),
        fixtureIds: z
          .array(z.string().min(1))
          .max(40)
          .optional()
          .describe('footshorts only: fixture ids the story is about; their match context is appended to the brief.'),
        sessionKeys: z
          .array(z.string().min(1))
          .max(24)
          .optional()
          .describe(
            'vizf1 only: telemetry session keys (<year>_<grand_prix_slug>_<R|S|Q|SQ|SS|FP1-3>) the story covers; their race context is appended.',
          ),
        drivers: z
          .array(z.string().min(1))
          .max(8)
          .optional()
          .describe('vizf1 only, with sessionKeys: the drivers to follow, by code (VER) or car number. Omitted: the top scorers.'),
        gameIds: z
          .array(z.string().regex(/^\d{6,12}$/, 'an ESPN event id'))
          .max(12)
          .optional()
          .describe('viznba only: ESPN event ids of the games the story covers; their box scores are appended.'),
        tripSlug: z
          .string()
          .regex(/^[a-z0-9][a-z0-9_-]{1,63}$/, 'a trip slug')
          .optional()
          .describe('travel only: the trip the story is about; its itinerary and curated photos are appended.'),
        day: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('travel only, with tripSlug: one day of the trip (its number). Omitted: the whole trip.'),
        prompt: z
          .string()
          .optional()
          .describe(
            'footshorts (with fixtureIds), vizf1 (with sessionKeys), viznba (with gameIds) or travel (with tripSlug: how the day ' +
              'really went): the editorial angle, surfaced at the top of the context.',
          ),
        spinId: z
          .string()
          .uuid()
          .optional()
          .describe('A randomizer spin id (vizmaya-fyi, footshorts or viznba, matching the spin); the brief carries its assignment and research.'),
        format: z
          .enum(AUTHORABLE_HTML_STORY_FORMATS as unknown as ['scroll', 'book', 'board', 'deck', 'collage', 'recap'])
          .default('scroll')
          .describe('The story format: scroll (one long page, the default), book, board, deck, collage (a cut-out collage on a kraft board), or recap (vizf1 only).'),
        tone: z
          .enum(HTML_STORY_TONES as unknown as ['straight', 'humorous'])
          .default('straight')
          .describe('The voice: straight (plain, the default) or humorous (wry, a little sarcastic; accuracy rules unchanged).'),
      },
    },
    async ({ app, randomStyle, competitionStyle, teamStyle, fixtureIds, sessionKeys, drivers, gameIds, tripSlug, day, prompt, spinId, format, tone }) => {
      const site = htmlStoriesUrlFor(config, app)
      const houseBrief = () => htmlStoryBrief({ app, siteUrl: site, format, tone })
      const ids = app === 'footshorts' ? (fixtureIds ?? []).filter(Boolean) : []
      const keys = app === 'vizf1' ? (sessionKeys ?? []).filter(Boolean) : []
      const games = app === 'viznba' ? (gameIds ?? []).filter(Boolean) : []
      const trip = app === 'travel' ? tripSlug ?? null : null
      if (drivers?.length && !keys.length) throw new Error('drivers need sessionKeys (vizf1 only).')
      if (day != null && !trip) throw new Error('day needs tripSlug (travel only).')
      if (spinId && (app === 'vizf1' || app === 'travel')) {
        throw new Error(`${app} has no randomizer: use app "vizmaya-fyi", "footshorts" or "viznba", whichever the spin is for.`)
      }

      // Styles come from the site's stories, the match context from its tables
      // and the Mapbox token from its env, so ask the deployed site for the
      // brief rather than building it here. The local build is the fallback.
      const url = new URL(`${site}/api/html-stories/brief`)
      if ((competitionStyle || teamStyle) && app !== 'footshorts') {
        throw new Error('competitionStyle and teamStyle are footshorts only.')
      }
      if (teamStyle) url.searchParams.set('style', `team:${teamStyle}`)
      else if (competitionStyle) url.searchParams.set('style', `competition:${competitionStyle}`)
      else if (randomStyle) url.searchParams.set('style', 'random')
      if (format !== 'scroll') url.searchParams.set('format', format)
      if (tone !== 'straight') url.searchParams.set('tone', tone)
      if (spinId) url.searchParams.set('spin', spinId)
      if (ids.length) {
        url.searchParams.set('fixtures', ids.join(','))
        if (prompt?.trim()) url.searchParams.set('prompt', prompt.trim())
      }
      if (keys.length) {
        url.searchParams.set('sessions', keys.join(','))
        if (drivers?.length) url.searchParams.set('drivers', drivers.join(','))
        if (prompt?.trim()) url.searchParams.set('prompt', prompt.trim())
      }
      if (games.length) {
        url.searchParams.set('games', games.join(','))
        if (prompt?.trim()) url.searchParams.set('prompt', prompt.trim())
      }
      if (trip) {
        url.searchParams.set('trip', trip)
        if (day != null) url.searchParams.set('day', String(day))
        if (prompt?.trim()) url.searchParams.set('prompt', prompt.trim())
      }
      const token = htmlStoriesToken(app)
      if (ids.length && !token) {
        throw new Error(
          'The match context needs the footshorts publish token in the MCP server env ' +
            '(FOOTSHORTS_HTML_STORIES_TOKEN, or HTML_STORIES_TOKEN).',
        )
      }
      if (keys.length && !token) {
        throw new Error(
          'The race context needs the vizf1 publish token in the MCP server env ' +
            '(VIZF1_HTML_STORIES_TOKEN, or HTML_STORIES_TOKEN).',
        )
      }
      if (games.length && !token) {
        throw new Error(
          'The game context needs the viznba publish token in the MCP server env ' +
            '(VIZNBA_HTML_STORIES_TOKEN, or HTML_STORIES_TOKEN).',
        )
      }
      if (trip && !token) {
        throw new Error(
          'The trip context needs the travel publish token in the MCP server env ' +
            '(TRAVEL_HTML_STORIES_TOKEN, or HTML_STORIES_TOKEN).',
        )
      }
      try {
        const res = await fetch(url, token ? { headers: { authorization: `Bearer ${token}` } } : undefined)
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
        return { content: [{ type: 'text', text: await res.text() }] }
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e)
        if (ids.length) throw new Error(`Could not build the match context: ${reason}`)
        if (keys.length) throw new Error(`Could not build the race context: ${reason}`)
        if (games.length) throw new Error(`Could not build the game context: ${reason}`)
        if (trip) throw new Error(`Could not build the trip context: ${reason}`)
        if (spinId) throw new Error(`Could not build the brief for spin ${spinId}: ${reason}`)
        if (teamStyle) throw new Error(`Could not read the ${teamStyle} team style: ${reason}`)
        if (competitionStyle) throw new Error(`Could not read the ${competitionStyle} competition style: ${reason}`)
        if (!randomStyle) return { content: [{ type: 'text', text: houseBrief() }] }
        return {
          content: [
            { type: 'text', text: `(Random style unavailable: ${reason}. Using the house style.)\n\n${houseBrief()}` },
          ],
        }
      }
    },
  )

  server.registerTool(
    'publish_html_story',
    {
      title: 'Publish an HTML story',
      description:
        'Publish one complete, self-contained HTML document to vizmaya.fyi/s/<slug>, (app: ' +
        '"footshorts") footshorts.com/s/<slug>, (app: "vizf1") vizf1.com/s/<slug>, (app: "viznba") the VizNBA ' +
        'site\'s /s/<slug> or (app: "travel") the trips site\'s /s/<slug>, private to the trip the page names in ' +
        '<meta name="travel:trip"> (its slug must start with the trip\'s). Pass the document as `html` or as a local ' +
        '`filePath`. Without publish=true it saves as a draft (re-posting an already published ' +
        'slug keeps it live). Posting to an existing slug replaces it; earlier versions stay ' +
        'restorable in admin. Returns the URL and lint warnings: fix them and post again to the ' +
        'same slug. Pass spinId when the page answers a randomizer spin, so the spin log records ' +
        'what shipped (an Atlas or Epics spin whose hero insight is not approved yet saves as a draft). A spin ' +
        'publishes to its own app: vizmaya-fyi for desk, atlas and epics, footshorts for the Football Desk, viznba for ' +
        'the NBA Desk.',
      inputSchema: {
        app: appSchema,
        slug: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase words joined by single hyphens')
          .max(80)
          .optional()
          .describe('URL slug, e.g. india-solar-boom-2026. Derived from <title> if omitted.'),
        html: z.string().optional().describe('The complete HTML document.'),
        filePath: z.string().optional().describe('Absolute path to a local .html file (instead of html).'),
        publish: z.boolean().default(false).describe('Make the story public now.'),
        title: z.string().optional().describe('Override the <title>-derived title.'),
        description: z.string().optional().describe('Override the meta description.'),
        aura: z
          .string()
          .optional()
          .describe(
            'aura.promad.design scene slug (or scene URL) to lay behind the page and use as its listing card ' +
              'background. Only when the user names one; omitted, a re-post keeps the current aura.',
          ),
        spinId: z.string().uuid().optional().describe('The randomizer spin this page answers (vizmaya-fyi, footshorts or viznba, matching the spin).'),
      },
    },
    async ({ app, slug, html, filePath, publish, title, description, aura, spinId }) => {
      const { token } = requireHtmlStoriesEnv(app)
      if (!html && !filePath) throw new Error('Pass either html or filePath.')
      const doc = html ?? (await readFile(filePath!, 'utf8'))

      const res = await fetch(`${htmlStoriesUrlFor(config, app)}/api/html-stories`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          slug,
          html: doc,
          status: publish ? 'published' : undefined,
          title,
          description,
          aura,
          spinId,
          source: 'mcp',
        }),
      })
      const body = await res.text()
      return {
        isError: !res.ok,
        content: [{ type: 'text', text: res.ok ? body : `Publish failed (HTTP ${res.status}): ${body}` }],
      }
    },
  )
  const slugSchema = z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase words joined by single hyphens')
    .max(80)
    .describe('The slug the story is (or will be) posted under; its images are filed with it.')

  /** POST to the site's assets endpoint (packages/html-stories/src/assetsApi.ts). */
  async function postAsset(app: HtmlStoryApp, query: Record<string, string | undefined>, init: RequestInit) {
    const { token } = requireHtmlStoriesEnv(app)
    const url = new URL(`${htmlStoriesUrlFor(config, app)}/api/html-stories/assets`)
    for (const [k, v] of Object.entries(query)) if (v) url.searchParams.set(k, v)
    const res = await fetch(url, { ...init, method: 'POST', headers: { authorization: `Bearer ${token}`, ...init.headers } })
    const body = await res.text()
    return {
      isError: !res.ok,
      content: [{ type: 'text' as const, text: res.ok ? body : `Saving the image failed (HTTP ${res.status}): ${body}` }],
    }
  }

  server.registerTool(
    'save_story_image',
    {
      title: 'Save a photo or video for an HTML story',
      description:
        'Host an openly licensed photo or short mp4 for an HTML story on the site\'s own storage, so the page ' +
        'never depends on the source keeping it. Pass `fromUrl` (the direct https file URL, e.g. a Wikimedia ' +
        'Commons upload.wikimedia.org thumbnail or an Openverse result\'s url) or a local `filePath`, plus its ' +
        '`credit` and `license` (CC0, PDM, CC BY or CC BY-SA only). Returns a permanent https `url` to use in ' +
        'the page; the same file saved twice returns the same url. Credit it in the figure\'s figcaption too.',
      inputSchema: {
        app: appSchema,
        slug: slugSchema,
        fromUrl: z.string().url().optional().describe('Direct https URL of the image or mp4 file (not its web page).'),
        filePath: z.string().optional().describe('Absolute path to a local image or mp4 (instead of fromUrl).'),
        credit: z.string().max(500).optional().describe('Author and source, e.g. "Jane Doe / Wikimedia Commons".'),
        license: z.string().max(100).optional().describe('e.g. "CC BY-SA 4.0", "CC0", "Public domain".'),
        sourcePage: z.string().url().optional().describe('The file\'s page (Commons file page, Flickr page) for the credit link.'),
        filename: z.string().max(80).optional().describe('A readable name; a content hash is appended.'),
      },
    },
    async ({ app, slug, fromUrl, filePath, credit, license, sourcePage, filename }) => {
      if (!fromUrl === !filePath) throw new Error('Pass exactly one of fromUrl or filePath.')
      if (fromUrl) {
        return postAsset(app, { slug }, {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ fromUrl, credit, license, sourcePage, filename }),
        })
      }
      const ext = filePath!.split('.').pop()?.toLowerCase() ?? ''
      const type = ext === 'mp4' ? 'video/mp4' : `image/${ext === 'jpg' ? 'jpeg' : ext || 'jpeg'}`
      return postAsset(
        app,
        { slug, credit, license, sourcePage, filename: filename ?? filePath!.split('/').pop() },
        { headers: { 'content-type': type }, body: await readFile(filePath!) },
      )
    },
  )

  server.registerTool(
    'generate_story_image',
    {
      title: 'Generate an AI illustration for an HTML story',
      description:
        'Generate an illustration through the Vismay AI gateway and host it with the story. For ideas, moods ' +
        'and section openers only, when no real photo fits: never a photorealistic real person, event or ' +
        'document. Write the prompt in the story\'s palette and one consistent style across the story. Returns ' +
        'a permanent https `url`; caption it "Illustration: AI-generated". Costs credits on each call.',
      inputSchema: {
        app: appSchema,
        slug: slugSchema,
        prompt: z.string().min(1).max(4000).describe('What to draw, in what style and palette.'),
        aspectRatio: z.enum(['16:9', '1:1', '9:16', '4:3', '3:4']).default('16:9'),
        filename: z.string().max(80).optional().describe('A readable name; a content hash is appended.'),
      },
    },
    async ({ app, slug, prompt, aspectRatio, filename }) =>
      postAsset(app, { slug }, {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ generate: { prompt, aspectRatio }, filename }),
      }),
  )
}
