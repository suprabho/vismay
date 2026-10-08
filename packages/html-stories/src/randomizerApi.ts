/**
 * The randomizer's agent endpoints, token-gated like the publish API
 * (`Authorization: Bearer $HTML_STORIES_TOKEN`), so the MCP server and any
 * agent with the token can spin, save research and refresh the Desk's heat.
 * vizmaya-fyi serves them for every randomizer (the MCP server calls it);
 * footshorts serves the spin routes and the Football Desk's news table, so an
 * agent holding only the footshorts token can work a Football Desk spin. All
 * spins share one log (one Supabase project), so the draw rules hold
 * whichever site is asked. Admin has its own session-gated routes over the
 * same @vismay/randomizer/spins helpers.
 *
 *   GET  /api/randomizer/spins?randomizer=&limit=   the spin log
 *   POST /api/randomizer/spins                      spin (or re-spin):
 *        { randomizer, from?, locks?, respin?, reason?, pair?, sequence?, source? }
 *   GET  /api/randomizer/spins/<id>                 one spin, with its research stub
 *   PUT  /api/randomizer/spins/<id>                 { research: "<markdown>" }
 *   GET  /api/randomizer/heat                       every Desk segment's heat and staleness
 *   POST /api/randomizer/heat                       { refreshed?: [{ subId, heat, topHeadlines? }],
 *                                                     failed?: [{ subId, error }], source? }
 *   GET  /api/randomizer/news                       the Football Desk's live news snapshot:
 *                                                     tournaments and teams with heat, headlines, fixtures
 *   GET  /api/randomizer/trends?randomizer=         what is trending today (the daily Xpoz snapshot),
 *                                                     optionally only the beats one randomizer reads
 *
 * The brief for a spin is GET /api/html-stories/brief?spin=<id> (./briefApi)
 * on the spin's own site, with &format=book|board|deck for a paged story
 * format.
 *
 * Server only.
 */

import { DESK } from '@vismay/randomizer/datasets'
import { DRAW_RULES } from '@vismay/randomizer/draw'
import { assignmentSection } from '@vismay/randomizer/spinBrief'
import { HTML_STORY_APP_META, type HtmlStoryApp } from './apps'
import { suggestedFormatFor } from './formats'
import {
  createSpin,
  getSpin,
  hasRandomizerEnv,
  isSpinId,
  listDeskHeat,
  listSpins,
  loadFootshortsNews,
  refreshDeskHeat,
  saveSpinResearch,
  SpinError,
  type HeatFailure,
  type HeatRefresh,
} from '@vismay/randomizer/spins'
import { researchFileName, researchStub } from '@vismay/randomizer/stub'
import { trendBeatsFor } from '@vismay/randomizer/trends'
import { latestTrends } from '@vismay/randomizer/trendsServer'
import { isRandomizerId, RANDOMIZER_META, RANDOMIZERS, RESPIN_REASONS, type SpinRecord } from '@vismay/randomizer/types'
import { HTML_STORIES_TOKEN_ENV, isHtmlStoriesTokenRequest } from './publishApi'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function gate(req: Request): Response | null {
  if (!process.env[HTML_STORIES_TOKEN_ENV]) {
    return json({ error: `the randomizer API is not configured (${HTML_STORIES_TOKEN_ENV} unset)` }, 503)
  }
  if (!isHtmlStoriesTokenRequest(req)) return json({ error: 'unauthorized' }, 401)
  if (!hasRandomizerEnv()) return json({ error: 'the randomizer needs Supabase service credentials' }, 503)
  return null
}

function fail(e: unknown): Response {
  if (e instanceof SpinError) return json({ error: e.message }, e.status)
  return json({ error: e instanceof Error ? e.message : String(e) }, 500)
}

async function body(req: Request): Promise<Record<string, unknown> | null> {
  const parsed = await req.json().catch(() => null)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
}

/** The `source` an agent names itself with, folded into created_by / refreshed_by. */
function sourceOf(b: Record<string, unknown>): string {
  const s = typeof b.source === 'string' ? b.source.trim().slice(0, 40) : ''
  return s === 'mcp' ? 'mcp' : s ? `api:${s}` : 'api'
}

const RANDOMIZER_LIST = RANDOMIZERS.join(', ')

/**
 * A spin as the agent endpoints return it: the record plus what to do with
 * it, including the story format its kind of story suits (./formats; the
 * brief is for a scrolling page unless asked for that one). The brief lives
 * on the spin's own site: this deployment's origin when that is the site
 * answering, its production origin otherwise.
 */
export function spinPayload(spin: SpinRecord, origin: string, app: HtmlStoryApp = 'vizmaya-fyi') {
  const suggestedFormat = suggestedFormatFor(spin.randomizer)
  const home = RANDOMIZER_META[spin.randomizer].app
  const site = home === app ? origin : HTML_STORY_APP_META[home].siteUrl
  return {
    spin,
    app: home,
    assignment: assignmentSection(spin),
    researchFile: researchFileName(spin),
    briefUrl: `${site}/api/html-stories/brief?spin=${spin.id}`,
    suggestedFormat,
    formatBriefUrl: `${site}/api/html-stories/brief?spin=${spin.id}&format=${suggestedFormat}`,
  }
}

/** GET and POST /api/randomizer/spins. `app` is the site answering. */
export async function handleRandomizerSpinsRequest(req: Request, app: HtmlStoryApp = 'vizmaya-fyi'): Promise<Response> {
  const denied = gate(req)
  if (denied) return denied
  const url = new URL(req.url)
  try {
    if (req.method === 'GET') {
      const r = url.searchParams.get('randomizer')
      if (r && !isRandomizerId(r)) return json({ error: `randomizer must be one of ${RANDOMIZER_LIST}` }, 400)
      const limit = Number(url.searchParams.get('limit') ?? 30) || 30
      return json({ spins: await listSpins({ randomizer: r && isRandomizerId(r) ? r : undefined, limit }) })
    }
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

    const b = await body(req)
    if (!b) return json({ error: 'expected a JSON object' }, 400)
    if (!isRandomizerId(b.randomizer)) return json({ error: `randomizer must be one of ${RANDOMIZER_LIST}` }, 400)
    const from = typeof b.from === 'string' && b.from ? b.from : null
    if (from && !isSpinId(from)) return json({ error: 'from must be a spin id' }, 400)
    const locks = Array.isArray(b.locks) ? b.locks.filter((l): l is string => typeof l === 'string') : []
    const reason = typeof b.reason === 'string' ? b.reason : null
    const spin = await createSpin({
      randomizer: b.randomizer,
      from,
      locks,
      respin: b.respin === true,
      reason,
      pair: b.pair === true,
      sequence: b.sequence === true,
      createdBy: sourceOf(b),
    })
    return json({ ...spinPayload(spin, url.origin, app), respinReasons: RESPIN_REASONS }, 201)
  } catch (e) {
    return fail(e)
  }
}

/** GET and PUT /api/randomizer/spins/<id>. `app` is the site answering. */
export async function handleRandomizerSpinRequest(req: Request, id: string, app: HtmlStoryApp = 'vizmaya-fyi'): Promise<Response> {
  const denied = gate(req)
  if (denied) return denied
  if (!isSpinId(id)) return json({ error: 'not a spin id' }, 400)
  const origin = new URL(req.url).origin
  try {
    if (req.method === 'GET') {
      const spin = await getSpin(id)
      if (!spin) return json({ error: `no spin ${id}` }, 404)
      return json({ ...spinPayload(spin, origin, app), researchStub: researchStub(spin) })
    }
    if (req.method !== 'PUT' && req.method !== 'PATCH') return json({ error: 'method not allowed' }, 405)
    const b = await body(req)
    if (!b || typeof b.research !== 'string' || !b.research.trim()) {
      return json({ error: 'expected { "research": "<markdown>" }' }, 400)
    }
    const spin = await saveSpinResearch(id, b.research)
    const next =
      spin.status === 'researching'
        ? 'No HERO INSIGHT section with a sentence yet. Add it, then save again.'
        : spin.status === 'insight_review'
          ? 'Hero insight saved. A human approves it in admin before the page can go public; post the page as a draft meanwhile.'
          : 'Hero insight saved. Build the page and the reel script from it.'
    return json({ ...spinPayload(spin, origin, app), next })
  } catch (e) {
    return fail(e)
  }
}

/** Every Desk segment with its live heat, for a refresh job to work through. */
async function heatTable() {
  const live = new Map((await listDeskHeat()).map((h) => [h.subId, h]))
  const now = Date.now()
  return DESK.sub_industries.map((s) => {
    const h = live.get(s.id)
    const updated = h?.heatUpdated ?? s.heat_updated
    const ageDays = updated ? Math.floor((now - Date.parse(updated)) / 864e5) : null
    return {
      subId: s.id,
      industry: DESK.industries.find((i) => i.id === s.industry)?.name ?? s.industry,
      name: s.name,
      heat: h?.heat ?? s.heat,
      heatUpdated: updated,
      ageDays,
      stale: ageDays === null || ageDays > DRAW_RULES.heatStaleDays,
      refreshStatus: h?.refreshStatus ?? null,
      refreshError: h?.refreshError ?? null,
      topHeadlines: h?.topHeadlines ?? s.top_headlines,
      keyMetrics: s.key_metrics,
      primarySources: s.primary_sources,
    }
  })
}

export type DeskHeatTableRow = Awaited<ReturnType<typeof heatTable>>[number]
export { heatTable as deskHeatTable }

function parseRefreshed(v: unknown): HeatRefresh[] | null {
  if (v === undefined) return []
  if (!Array.isArray(v)) return null
  const out: HeatRefresh[] = []
  for (const r of v) {
    if (!r || typeof r !== 'object') return null
    const { subId, heat, topHeadlines } = r as Record<string, unknown>
    if (typeof subId !== 'string' || typeof heat !== 'number' || !Number.isFinite(heat)) return null
    out.push({ subId, heat, topHeadlines: Array.isArray(topHeadlines) ? (topHeadlines as HeatRefresh['topHeadlines']) : [] })
  }
  return out
}

function parseFailed(v: unknown): HeatFailure[] | null {
  if (v === undefined) return []
  if (!Array.isArray(v)) return null
  const out: HeatFailure[] = []
  for (const r of v) {
    if (!r || typeof r !== 'object') return null
    const { subId, error } = r as Record<string, unknown>
    if (typeof subId !== 'string') return null
    out.push({ subId, error: typeof error === 'string' && error.trim() ? error.trim() : 'refresh failed' })
  }
  return out
}

/** GET and POST /api/randomizer/heat. */
export async function handleDeskHeatRequest(req: Request): Promise<Response> {
  const denied = gate(req)
  if (denied) return denied
  try {
    if (req.method === 'GET') return json({ staleAfterDays: DRAW_RULES.heatStaleDays, subIndustries: await heatTable() })
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
    const b = await body(req)
    const refreshed = b ? parseRefreshed(b.refreshed) : null
    const failed = b ? parseFailed(b.failed) : null
    if (!b || !refreshed || !failed) {
      return json({ error: 'expected { refreshed?: [{ subId, heat, topHeadlines? }], failed?: [{ subId, error }] }' }, 400)
    }
    await refreshDeskHeat({ refreshed, failed }, sourceOf(b))
    return json({ ok: true, staleAfterDays: DRAW_RULES.heatStaleDays, subIndustries: await heatTable() })
  } catch (e) {
    return fail(e)
  }
}

/**
 * GET /api/randomizer/news: the Football Desk's live news snapshot, the
 * same one a spin draws from (tournaments and teams with fixtures in the
 * window, their news heat, newest headlines, recent and next fixtures).
 * Read-only: it is computed from the footshorts feed, never written.
 */
export async function handleFootshortsNewsRequest(req: Request): Promise<Response> {
  const denied = gate(req)
  if (denied) return denied
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405)
  try {
    return json(await loadFootshortsNews())
  } catch (e) {
    return fail(e)
  }
}

/**
 * GET /api/randomizer/trends: the newest daily trend snapshot (Reddit's top
 * threads and the most-engaged X posts per beat, read from Xpoz by the daily
 * job), the same one a spin's brief carries. `?randomizer=` keeps only the
 * beats that randomizer reads. Read-only: the job writes it.
 */
export async function handleTrendsRequest(req: Request): Promise<Response> {
  const denied = gate(req)
  if (denied) return denied
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405)
  const r = new URL(req.url).searchParams.get('randomizer')
  if (r && !isRandomizerId(r)) return json({ error: `randomizer must be one of ${RANDOMIZER_LIST}` }, 400)
  try {
    const snapshot = await latestTrends()
    if (!snapshot) return json({ snapshot: null, note: 'no trend snapshot yet: the daily randomizer-trends job has not run' })
    if (!r || !isRandomizerId(r)) return json({ snapshot })
    const ids = new Set(trendBeatsFor(r).map((b) => b.id))
    return json({ snapshot: { ...snapshot, beats: snapshot.beats.filter((b) => ids.has(b.id)) } })
  } catch (e) {
    return fail(e)
  }
}
