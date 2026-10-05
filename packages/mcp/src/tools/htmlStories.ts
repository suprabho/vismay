/**
 * Tools: `get_html_story_brief` and `publish_html_story`.
 *
 * The agent-authored HTML story pipeline (packages/html-stories): the agent
 * reads the brief, writes one self-contained HTML page, and publishes it to
 * <site>/s/<slug> through the token-gated publish API. Two sites host them —
 * vizmaya.fyi (the default) and footshorts.com — chosen with `app`. Pure HTTP
 * to the deployed site, so no dev server is needed.
 *
 * A footshorts brief can carry a MATCH CONTEXT: pass `fixtureIds` (up to 40 footshorts
 * fixture uuids, from the admin HTML stories tab's match picker or a
 * footshorts.com/match/<id> URL) and the site appends everything its match
 * tables know — Opta facts and the full stat set, the timeline, insights,
 * commentary, the build-up, both sides' form and schedule, the table and the
 * competition's next fixtures. That variant needs the publish token.
 *
 * A vizmaya brief can carry a randomizer spin instead (`spinId`, from
 * `spin_randomizer` in ./randomizer): the assignment, research protocol,
 * output format and research file for that spin. Publishing with the same
 * `spinId` ties the page to the spin.
 */

import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { htmlStoryBrief } from '@vismay/html-stories/brief'
import { htmlStoriesToken, htmlStoriesUrlFor, requireHtmlStoriesEnv, type VismayMcpConfig } from '../config.js'

const appSchema = z
  .enum(['vizmaya-fyi', 'footshorts'])
  .default('vizmaya-fyi')
  .describe('Which site hosts the story: vizmaya.fyi (default) or footshorts.com.')

export function registerHtmlStoryTools(server: McpServer, config: VismayMcpConfig): void {
  server.registerTool(
    'get_html_story_brief',
    {
      title: 'Get the HTML story brief',
      description:
        'Read this before writing a vizmaya or footshorts HTML story. It covers the hosting ' +
        'contract (one self-contained HTML file), the site\'s house design direction, chart ' +
        'rules, a self-check list, and how to publish. Pass randomStyle=true to swap the house ' +
        'style for a palette and fonts drawn at random from the site\'s existing stories. For ' +
        'footshorts, pass fixtureIds (up to 40 fixture ids) to append the match context — Opta ' +
        'facts, timeline, insights, commentary, schedules and the table — the story must be ' +
        'written from, plus an optional editorial prompt. For a vizmaya randomizer spin, pass spinId ' +
        '(from spin_randomizer) to get its assignment, research protocol, output format and research file.',
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
        prompt: z
          .string()
          .optional()
          .describe('footshorts only, with fixtureIds: the editorial angle, surfaced at the top of the match context.'),
        spinId: z
          .string()
          .uuid()
          .optional()
          .describe('vizmaya only: a randomizer spin id; the brief carries that spin\'s assignment and research.'),
      },
    },
    async ({ app, randomStyle, fixtureIds, prompt, spinId }) => {
      const site = htmlStoriesUrlFor(config, app)
      const houseBrief = () => htmlStoryBrief({ app, siteUrl: site })
      const ids = app === 'footshorts' ? (fixtureIds ?? []).filter(Boolean) : []
      if (spinId && app !== 'vizmaya-fyi') throw new Error('Randomizer spins are vizmaya stories: use app "vizmaya-fyi".')

      // Styles come from the site's stories, the match context from its tables
      // and the Mapbox token from its env, so ask the deployed site for the
      // brief rather than building it here. The local build is the fallback.
      const url = new URL(`${site}/api/html-stories/brief`)
      if (randomStyle) url.searchParams.set('style', 'random')
      if (spinId) url.searchParams.set('spin', spinId)
      if (ids.length) {
        url.searchParams.set('fixtures', ids.join(','))
        if (prompt?.trim()) url.searchParams.set('prompt', prompt.trim())
      }
      const token = htmlStoriesToken(app)
      if (ids.length && !token) {
        throw new Error(
          'The match context needs the footshorts publish token in the MCP server env ' +
            '(FOOTSHORTS_HTML_STORIES_TOKEN, or HTML_STORIES_TOKEN).',
        )
      }
      try {
        const res = await fetch(url, token ? { headers: { authorization: `Bearer ${token}` } } : undefined)
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
        return { content: [{ type: 'text', text: await res.text() }] }
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e)
        if (ids.length) throw new Error(`Could not build the match context: ${reason}`)
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
        'Publish one complete, self-contained HTML document to vizmaya.fyi/s/<slug> or (app: ' +
        '"footshorts") footshorts.com/s/<slug>. Pass the document as `html` or as a local ' +
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
}
