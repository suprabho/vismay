/**
 * The randomizer's agent endpoints, token-gated like the publish API
 * (`Authorization: Bearer $HTML_STORIES_TOKEN`), so the MCP server and any
 * agent with the token can spin, save research and refresh the Desk's heat.
 * vizmaya-fyi serves them for every randomizer (the MCP server calls it);
 * footshorts serves the spin routes and the Football Desk's news table, so an
 * agent holding only the footshorts token can work a Football Desk spin; viznba
 * does the same for the NBA Desk. All
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
 *                                                     (on viznba: the NBA Desk's, conferences and
 *                                                     franchises with heat, headlines, games)
 *   GET  /api/randomizer/ocw?topic=&kind=&course=&u=  a page of the OCW Desk's pool (vizmaya only):
 *                                                     the files of one kind under one topic, or in one
 *                                                     course, as a spin would see them; without a query,
 *                                                     the taxonomy (fields, topics with their file counts, kinds)
 *   GET  /api/randomizer/cron/ocw                   the OCW Desk's daily spin (Vercel Cron, CRON_SECRET):
 *                                                     spins once per UTC day unless a kept spin exists
 *
 * The brief for a spin is GET /api/html-stories/brief?spin=<id> (./briefApi)
 * on the spin's own site, with &format=book|board|deck for a paged story
 * format.
 *
 * Server only.
 */

import { DESK, OCW } from '@vismay/randomizer/datasets'
import { DRAW_RULES } from '@vismay/randomizer/draw'
import { loadOcwPool } from '@vismay/randomizer/ocwPool'
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
  loadViznbaNews,
  refreshDeskHeat,
  saveSpinResearch,
  SpinError,
  spunOn,
  type HeatFailure,
  type HeatRefresh,
} from '@vismay/randomizer/spins'
import { researchFileName, researchStub } from '@vismay/randomizer/stub'
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
 * GET /api/randomizer/news on viznba: the NBA Desk's live news snapshot, the
 * same one a spin draws from (conferences and all 30 franchises, their news
 * heat, newest headlines, the people in the news, recent and next games).
 * Read-only: computed from the viznba_ tables and ESPN's scoreboard.
 */
export async function handleViznbaNewsRequest(req: Request): Promise<Response> {
  const denied = gate(req)
  if (denied) return denied
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405)
  try {
    return json(await loadViznbaNews())
  } catch (e) {
    return fail(e)
  }
}

/**
 * GET /api/randomizer/ocw on vizmaya: a page of the OCW Desk's pool, read
 * the way a spin reads it (packages/randomizer ocwPool.ts), for an agent
 * that wants to look before locking a topic or a course. `topic` (a topic
 * name from the taxonomy) and `kind` (a resource kind) select the page;
 * `course` (a MIT Learn course id) reads that course's files of the kind
 * instead; `u` in [0, 1) picks where the page starts (random otherwise).
 * Without `topic` or `course` it answers the taxonomy: fields, topics with
 * their file counts per kind, kinds and lenses. Read-only.
 */
export async function handleOcwPoolRequest(req: Request): Promise<Response> {
  const denied = gate(req)
  if (denied) return denied
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405)
  const url = new URL(req.url)
  const topicName = url.searchParams.get('topic')?.trim() || null
  const kindName = url.searchParams.get('kind')?.trim() || null
  const courseParam = url.searchParams.get('course')?.trim() || null
  if (!topicName && !courseParam) {
    return json({
      fields: OCW.fields,
      topics: OCW.topics,
      kinds: OCW.kinds,
      lenses: OCW.lenses,
      note: 'Pass topic and kind (or course and kind) for a page of files, as a spin would read it.',
    })
  }
  const kind = kindName ? OCW.kinds.find((k) => k.name.toLowerCase() === kindName.toLowerCase()) : undefined
  if (!kind) return json({ error: `kind must be one of ${OCW.kinds.map((k) => k.name).join(', ')}` }, 400)
  const topic = topicName ? OCW.topics.find((t) => t.name.toLowerCase() === topicName.toLowerCase()) : undefined
  if (topicName && !topic) return json({ error: `unknown topic "${topicName}": see GET /api/randomizer/ocw for the taxonomy` }, 400)
  const courseId = courseParam ? Number(courseParam) : null
  if (courseParam && !(courseId! > 0 && Number.isInteger(courseId))) return json({ error: 'course must be a MIT Learn course id' }, 400)
  const uParam = url.searchParams.get('u')
  const u = uParam === null ? Math.random() : Number(uParam)
  if (!(u >= 0 && u < 1)) return json({ error: 'u must be in [0, 1)' }, 400)
  const field = topic ? OCW.fields.find((f) => f.id === topic.field)! : OCW.fields[0]!
  try {
    const pool = await loadOcwPool({
      field,
      topic: topic ?? { id: 0, field: field.id, name: '', files: {} },
      kind,
      lens: OCW.lenses[0]!,
      u,
      query: { topic: topic?.name ?? '', kind: kind.name, courseId },
      keepFile: null,
      afterFile: null,
    })
    return json(pool)
  } catch (e) {
    return json({ error: `The OCW pool could not be read: ${e instanceof Error ? e.message : String(e)}` }, 503)
  }
}

/**
 * GET /api/randomizer/cron/ocw on vizmaya: the OCW Desk's daily spin. Vercel
 * Cron calls it (apps/vizmaya-fyi/vercel.json) with `Authorization: Bearer
 * $CRON_SECRET`; it fails closed without the secret. One spin per UTC day:
 * when a kept OCW spin already exists today (someone spun by hand), it
 * answers with that one and spins nothing.
 */
export async function handleOcwDailySpinRequest(req: Request, origin: string): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) return json({ error: 'CRON_SECRET is not set on this project' }, 503)
  if (req.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401)
  if (!hasRandomizerEnv()) return json({ error: 'the randomizer needs Supabase service credentials' }, 503)
  try {
    const existing = await spunOn('ocw')
    if (existing) return json({ ok: true, spun: false, ...spinPayload(existing, origin) })
    const spin = await createSpin({ randomizer: 'ocw', createdBy: 'cron' })
    console.log(`[randomizer] ocw daily spin ${spin.id}: ${spin.summary}`)
    return json({ ok: true, spun: true, ...spinPayload(spin, origin) })
  } catch (e) {
    return fail(e)
  }
}
