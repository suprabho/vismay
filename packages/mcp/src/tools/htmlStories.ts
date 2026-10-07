/**
 * Tools: `get_html_story_brief`, `publish_html_story`, and the story's media:
 * `save_story_image` and `generate_story_image`.
 *
 * The agent-authored HTML story pipeline (packages/html-stories): the agent
 * reads the brief, writes one self-contained HTML page, and publishes it to
 * <site>/s/<slug> through the token-gated publish API. Three sites host them —
 * vizmaya.fyi (the default), footshorts.com and vizf1.com — chosen with `app`.
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
 * A vizmaya brief can carry a randomizer spin instead (`spinId`, from
 * `spin_randomizer` in ./randomizer): the assignment, research protocol,
 * output format and research file for that spin. Publishing with the same
 * `spinId` ties the page to the spin.
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
import { HTML_STORY_FORMATS } from '@vismay/html-stories/formats'
import {
  htmlStoriesToken,
  htmlStoriesUrlFor,
  requireHtmlStoriesEnv,
  type HtmlStoryApp,
  type VismayMcpConfig,
} from '../config.js'

const appSchema = z
  .enum(['vizmaya-fyi', 'footshorts', 'vizf1'])
  .default('vizmaya-fyi')
  .describe('Which site hosts the story: vizmaya.fyi (default), footshorts.com or vizf1.com.')

export function registerHtmlStoryTools(server: McpServer, config: VismayMcpConfig): void {
  server.registerTool(
    'get_html_story_brief',
    {
      title: 'Get the HTML story brief',
      description:
        'Read this before writing a vizmaya, footshorts or vizf1 HTML story. It covers the hosting ' +
        'contract (one self-contained HTML file), the site\'s house design direction, chart ' +
        'rules, a self-check list, and how to publish. Pass randomStyle=true to swap the house ' +
        'style for a palette and fonts drawn at random from the site\'s existing stories. For ' +
        'footshorts, pass fixtureIds (up to 40 fixture ids) to append the match context — Opta ' +
        'facts, timeline, insights, commentary, schedules and the table — the story must be ' +
        'written from, plus an optional editorial prompt. For vizf1, pass sessionKeys (up to 24 telemetry ' +
        'session keys, e.g. 2026_australian_grand_prix_R, across races and seasons) and optionally drivers ' +
        '(up to 8 codes such as VER) to append the race context: classifications, lap-by-lap timing, sectors, ' +
        'speed traps, strategy, the head-to-head across sessions and the standings round by round. ' +
        'For a vizmaya randomizer spin, pass spinId ' +
        '(from spin_randomizer) to get its assignment, research protocol, output format and research file. ' +
        'Pass format to write something other than a scrolling page: "book" (pages the reader turns; ' +
        'suits a chronology or a journey), "board" (a pinned board with a guided camera tour; suits a ' +
        'case built from many connected pieces), "deck" (slides or a stack of cards; suits an argument ' +
        'made one point at a time) or, for vizf1 with a race in sessionKeys, "recap" (chapters the reader ' +
        'scrolls while the 3D race replay beside them jumps to each moment; suits a race told through its moments).',
      inputSchema: {
        app: appSchema,
        randomStyle: z
          .boolean()
          .default(false)
          .describe('Use a random palette + font trio from an existing story instead of the house style.'),
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
        prompt: z
          .string()
          .optional()
          .describe('footshorts (with fixtureIds) or vizf1 (with sessionKeys): the editorial angle, surfaced at the top of the context.'),
        spinId: z
          .string()
          .uuid()
          .optional()
          .describe('vizmaya only: a randomizer spin id; the brief carries that spin\'s assignment and research.'),
        format: z
          .enum(HTML_STORY_FORMATS as unknown as ['scroll', 'book', 'board', 'deck', 'recap'])
          .default('scroll')
          .describe('The story format: scroll (one long page, the default), book, board, deck, or recap (vizf1 only).'),
      },
    },
    async ({ app, randomStyle, fixtureIds, sessionKeys, drivers, prompt, spinId, format }) => {
      const site = htmlStoriesUrlFor(config, app)
      const houseBrief = () => htmlStoryBrief({ app, siteUrl: site, format })
      const ids = app === 'footshorts' ? (fixtureIds ?? []).filter(Boolean) : []
      const keys = app === 'vizf1' ? (sessionKeys ?? []).filter(Boolean) : []
      if (drivers?.length && !keys.length) throw new Error('drivers need sessionKeys (vizf1 only).')
      if (spinId && app !== 'vizmaya-fyi') throw new Error('Randomizer spins are vizmaya stories: use app "vizmaya-fyi".')

      // Styles come from the site's stories, the match context from its tables
      // and the Mapbox token from its env, so ask the deployed site for the
      // brief rather than building it here. The local build is the fallback.
      const url = new URL(`${site}/api/html-stories/brief`)
      if (randomStyle) url.searchParams.set('style', 'random')
      if (format !== 'scroll') url.searchParams.set('format', format)
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
      try {
        const res = await fetch(url, token ? { headers: { authorization: `Bearer ${token}` } } : undefined)
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
        return { content: [{ type: 'text', text: await res.text() }] }
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e)
        if (ids.length) throw new Error(`Could not build the match context: ${reason}`)
        if (keys.length) throw new Error(`Could not build the race context: ${reason}`)
        if (spinId) throw new Error(`Could not build the brief for spin ${spinId}: ${reason}`)
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
        '"footshorts") footshorts.com/s/<slug> or (app: "vizf1") vizf1.com/s/<slug>. Pass the document as `html` or as a local ' +
        '`filePath`. Without publish=true it saves as a draft (re-posting an already published ' +
        'slug keeps it live). Posting to an existing slug replaces it; earlier versions stay ' +
        'restorable in admin. Returns the URL and lint warnings: fix them and post again to the ' +
        'same slug. Pass spinId when the page answers a randomizer spin, so the spin log records ' +
        'what shipped (an Atlas or Epics spin whose hero insight is not approved yet saves as a draft).',
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
        spinId: z.string().uuid().optional().describe('vizmaya only: the randomizer spin this page answers.'),
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
