/**
 * Tools: `spin_randomizer`, `get_randomizer_spin`, `save_spin_research`,
 * `get_desk_heat`, `refresh_desk_heat` and `get_football_news`.
 *
 * The story randomizers (packages/randomizer): for vizmaya, Desk (industry,
 * editorial format), Atlas (countries and culture, geography format) and
 * Epics (epics place by place, geography format); for footshorts, the
 * Football Desk (a tournament, a team, an angle and a freshness, weighted by
 * the team's news on footshorts; football explainer with match context). A
 * spin draws the topic under the playbook's rules and is logged; the agent
 * then reads the spin's brief (`get_html_story_brief` with `spinId` and the
 * spin's app), researches, saves the research file here, and publishes the
 * page with the same `spinId`. Pure HTTP to the deployed site with the
 * publish token, so the draw always sees the real log (one log for both
 * sites: a Football Desk spin is created on footshorts.com with the
 * footshorts token, everything else on vizmaya.fyi).
 */

import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { RANDOMIZER_META, type RandomizerApp, type RuleFired, type SpinRecord } from '@vismay/randomizer/types'
import { htmlStoriesToken, htmlStoriesUrlFor, requireHtmlStoriesEnv, type VismayMcpConfig } from '../config.js'

const spinIdSchema = z.string().uuid().describe('A spin id, as spin_randomizer returned it.')

/**
 * Both sites serve every spin from the one log, so a call by spin id goes to
 * whichever site this server holds a token for (vizmaya first).
 */
function anySite(): RandomizerApp {
  return htmlStoriesToken('vizmaya-fyi') ? 'vizmaya-fyi' : htmlStoriesToken('footshorts') ? 'footshorts' : 'vizmaya-fyi'
}

async function call(config: VismayMcpConfig, path: string, init: RequestInit = {}, app: RandomizerApp = anySite()): Promise<any> {
  const { token } = requireHtmlStoriesEnv(app)
  const res = await fetch(`${htmlStoriesUrlFor(config, app)}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  const text = await res.text()
  let body: any = null
  try {
    body = JSON.parse(text)
  } catch {
    body = { error: text.slice(0, 300) }
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body?.error ?? text.slice(0, 300)}`)
  return body
}

function describeSpin(spin: SpinRecord): string {
  const reels = Object.entries(spin.reels).map(([k, r]) => `- ${k}: ${r.value}${r.sub ? ` (${r.sub})` : ''}${r.badge ? ` [${r.badge}]` : ''}`)
  const rules = (spin.rules as RuleFired[]).map((r) => `- [${r.tag}] ${r.text}`)
  return [
    `Spin ${spin.id} (${spin.randomizer}, ${spin.status}) · seed ${spin.seed} · ${spin.createdAt.slice(0, 10)}`,
    spin.summary,
    '',
    'Reels:',
    ...reels,
    '',
    'Rules that fired:',
    ...rules,
    ...(spin.heroInsight ? ['', `Hero insight: ${spin.heroInsight}`] : []),
    ...(spin.reviewNote ? [`Reviewer note: ${spin.reviewNote}`] : []),
    ...(spin.storySlug ? [`Story: ${spin.storySlug}`] : []),
  ].join('\n')
}

export function registerRandomizerTools(server: McpServer, config: VismayMcpConfig): void {
  server.registerTool(
    'spin_randomizer',
    {
      title: 'Spin a story randomizer',
      description:
        'Draw a story topic and log the spin. For vizmaya.fyi, randomizer: "desk" (industry, sub-industry, lens and ' +
        'news freshness, heat weighted; editorial brief with charts), "atlas" (a country, a cultural thread, a time ' +
        'depth, a geography frame and a lens; route table), or "epics" (an epic, an episode, a place and a lens; ' +
        'route table with geography status). For footshorts.com, "footshorts" (the Football Desk: a tournament, a ' +
        'team in it, an angle and a news freshness, weighted by how much footshorts news each has; football ' +
        'explainer whose brief carries the match context of the team\'s recent and next fixtures). The draw applies ' +
        'the playbook rules: 30 and 90 day repeat blocks, heat weighting, region, tradition and tournament ' +
        'balancing, the philosophical quota. To keep some reels, pass `from` ' +
        '(the spin on screen) and `locks`. To reject a spin and draw again, pass `from`, respin=true and a reason. ' +
        'Next: get_html_story_brief with spinId (and app "footshorts" for a Football Desk spin), research, ' +
        'save_spin_research, then publish_html_story with spinId (same app).',
      inputSchema: {
        randomizer: z.enum(['desk', 'atlas', 'epics', 'footshorts']),
        from: spinIdSchema.optional().describe('The spin the locks keep values from, or the one a re-spin rejects.'),
        locks: z
          .array(z.string())
          .optional()
          .describe(
            'Reel keys to keep from `from`. desk: industry, sub, lens, fresh. atlas: country, thread, time, frame, ' +
              'lens. epics: epic, episode, place, lens. footshorts: competition, team, angle, fresh. A child lock ' +
              'implies its parents.',
          ),
        respin: z.boolean().default(false).describe('Reject `from` (logged) and draw again.'),
        reason: z
          .string()
          .optional()
          .describe('Why the re-spin: boring, too recent, no data, too sensitive, or other with a few words.'),
        pair: z
          .boolean()
          .default(false)
          .describe(
            'atlas: draw a second country; the story is the relationship (about once a week). footshorts: draw a ' +
              'head-to-head opponent from the same tournament, preferring one the team meets in the window.',
          ),
        sequence: z.boolean().default(false).describe('epics only: continue the previous spin\'s route to its next place.'),
      },
    },
    async ({ randomizer, from, locks, respin, reason, pair, sequence }) => {
      const app = RANDOMIZER_META[randomizer].app
      const body = await call(
        config,
        '/api/randomizer/spins',
        { method: 'POST', body: JSON.stringify({ randomizer, from, locks, respin, reason, pair, sequence, source: 'mcp' }) },
        app,
      )
      const spin = body.spin as SpinRecord
      const appArg = app === 'vizmaya-fyi' ? '' : ` and app "${app}"`
      return {
        content: [
          {
            type: 'text',
            text:
              `${describeSpin(spin)}\n\n${body.assignment}\n\nNext: call get_html_story_brief with spinId "${spin.id}"${appArg} for the full brief (research protocol, format, research stub). Research file: ${body.researchFile}.` +
              (body.suggestedFormat
                ? ` The brief is for a scrolling page; a story like this also suits a ${body.suggestedFormat} (add format: "${body.suggestedFormat}").`
                : ''),
          },
        ],
      }
    },
  )

  server.registerTool(
    'get_randomizer_spin',
    {
      title: 'Get a randomizer spin',
      description: 'Read one logged spin: its reels, rules, status, hero insight, reviewer note, linked story and research stub.',
      inputSchema: { spinId: spinIdSchema },
    },
    async ({ spinId }) => {
      const body = await call(config, `/api/randomizer/spins/${spinId}`)
      const spin = body.spin as SpinRecord
      const research = spin.researchMd ? `Research file (saved):\n\n${spin.researchMd}` : `Research stub:\n\n${body.researchStub}`
      return { content: [{ type: 'text', text: `${describeSpin(spin)}\n\n${research}` }] }
    },
  )

  server.registerTool(
    'save_spin_research',
    {
      title: 'Save a spin\'s research file',
      description:
        'Save the research MD for a spin (claims log, gaps, HERO INSIGHT). Pass `markdown` or a local `filePath`. ' +
        'The spin\'s status follows the HERO INSIGHT section: without one it stays researching; with one, Atlas and ' +
        'Epics spins wait for a human to approve the insight in admin before the page can go public, and Desk ' +
        'spins are ready to build. Save again to update it.',
      inputSchema: {
        spinId: spinIdSchema,
        markdown: z.string().optional().describe('The research file.'),
        filePath: z.string().optional().describe('Absolute path to a local .md file (instead of markdown).'),
      },
    },
    async ({ spinId, markdown, filePath }) => {
      if (!markdown && !filePath) throw new Error('Pass either markdown or filePath.')
      const research = markdown ?? (await readFile(filePath!, 'utf8'))
      const body = await call(config, `/api/randomizer/spins/${spinId}`, { method: 'PUT', body: JSON.stringify({ research }) })
      return { content: [{ type: 'text', text: `${describeSpin(body.spin as SpinRecord)}\n\n${body.next}` }] }
    },
  )

  server.registerTool(
    'get_desk_heat',
    {
      title: 'Get the Desk heat table',
      description:
        'Every Vizmaya Desk sub-industry with its heat (0 to 100), when it was last refreshed, whether it is stale ' +
        '(older than 7 days) or its last refresh failed, its top headlines, key metrics and primary sources. Use it ' +
        'to run the weekly heat refresh, then report back with refresh_desk_heat.',
      inputSchema: {},
    },
    async () => {
      const body = await call(config, '/api/randomizer/heat')
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] }
    },
  )

  server.registerTool(
    'refresh_desk_heat',
    {
      title: 'Refresh Desk heat scores',
      description:
        'Write a heat refresh for Desk sub-industries. Heat (0 to 100) blends news volume in the last 14 days, ' +
        'price or capex movement, regulatory or policy events, and search interest. Include up to 3 dated, sourced ' +
        'headlines per segment (newest first). Report every segment you could not refresh under `failed` with the ' +
        'reason: a failed refresh is shown in admin and turns that segment\'s spins Evergreen until it succeeds.',
      inputSchema: {
        refreshed: z
          .array(
            z.object({
              subId: z.string(),
              heat: z.number().min(0).max(100),
              topHeadlines: z
                .array(z.object({ title: z.string(), url: z.string().url(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
                .max(3)
                .optional(),
            }),
          )
          .default([]),
        failed: z.array(z.object({ subId: z.string(), error: z.string() })).default([]),
      },
    },
    async ({ refreshed, failed }) => {
      const body = await call(config, '/api/randomizer/heat', {
        method: 'POST',
        body: JSON.stringify({ refreshed, failed, source: 'mcp' }),
      })
      const stale = (body.subIndustries as Array<{ name: string; stale: boolean; refreshStatus: string | null }>).filter(
        (s) => s.stale || s.refreshStatus === 'failed',
      )
      return {
        content: [
          {
            type: 'text',
            text: `Saved ${refreshed.length} refreshed and ${failed.length} failed. Still stale or failed: ${
              stale.length ? stale.map((s) => s.name).join(', ') : 'none'
            }.`,
          },
        ],
      }
    },
  )

  server.registerTool(
    'get_football_news',
    {
      title: 'Get the Football Desk news table',
      description:
        'The live footshorts news the Football Desk randomizer draws from: every covered tournament with its news ' +
        'heat (0 to 100) and story count over the last 14 days, and every team with fixtures in the window, with ' +
        'its tournaments, heat, story count, newest headlines and its recent and next fixtures. Computed from the ' +
        'footshorts feed on each call, so there is nothing to refresh.',
      inputSchema: {},
    },
    async () => {
      const body = await call(config, '/api/randomizer/news', {}, htmlStoriesToken('footshorts') ? 'footshorts' : anySite())
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] }
    },
  )
}
