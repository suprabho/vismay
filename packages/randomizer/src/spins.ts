/**
 * Server-side reads and writes for the randomizer: the spin log
 * (randomizer_spins) and the Desk's live heat (desk_heat), migration 088.
 *
 * A spin is created only here, and only by an authenticated caller (admin's
 * session-gated routes, or the token-gated routes on vizmaya-fyi that the MCP
 * server and agents call), so the log the repeat blocks read can't be filled
 * by anyone with the public brief URL.
 *
 * Lifecycle: spun → (re-spin: rejected) → researching (research saved, no
 * hero insight yet) → insight_review (hero insight written, gated
 * randomizers) → approved (a human approved it; ungated Desk spins skip
 * straight here) → published (a story tied to the spin went public).
 *
 * Server only: imports the service Supabase client.
 */

import { createServiceClient } from '@vismay/content-source/supabase'
import { DESK } from './datasets'
import { draw } from './draw'
import { randomSeed, seedHex } from './rng'
import { extractHeroInsight } from './stub'
import {
  RANDOMIZER_META,
  type DeskHeadline,
  type DeskHeatRow,
  type RandomizerId,
  type SpinHistoryEntry,
  type SpinRecord,
  type SpinStatus,
} from './types'

const DAY = 864e5
const MIGRATION_HINT = 'The randomizer needs migration 088_randomizer.sql applied'

/** A failure with the HTTP status the routes should answer with. */
export class SpinError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export function hasRandomizerEnv(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function check(error: { code?: string; message: string } | null): void {
  if (!error) return
  if (error.code === '42P01' || error.code === 'PGRST205') throw new SpinError(MIGRATION_HINT, 503)
  throw new SpinError(error.message, 500)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isSpinId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

function mapSpin(r: any): SpinRecord {
  return {
    id: r.id,
    randomizer: r.randomizer,
    status: r.status,
    seed: r.seed,
    reels: r.reels ?? {},
    picks: r.picks,
    subject: r.subject,
    primary: r.primary_value,
    combo: r.combo,
    summary: r.summary,
    rules: r.rules ?? [],
    meta: r.meta ?? {},
    options: { locks: [], ...(r.options ?? {}) },
    rejectedReason: r.rejected_reason ?? null,
    respinOf: r.respin_of ?? null,
    researchMd: r.research_md ?? null,
    heroInsight: r.hero_insight ?? null,
    reviewNote: r.review_note ?? null,
    storySlug: r.story_slug ?? null,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function getSpin(id: string): Promise<SpinRecord | null> {
  if (!isSpinId(id)) return null
  const { data, error } = await createServiceClient().from('randomizer_spins').select('*').eq('id', id).maybeSingle()
  check(error)
  return data ? mapSpin(data) : null
}

export async function listSpins({ randomizer, limit = 50 }: { randomizer?: RandomizerId; limit?: number } = {}): Promise<SpinRecord[]> {
  let q = createServiceClient()
    .from('randomizer_spins')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200))
  if (randomizer) q = q.eq('randomizer', randomizer)
  const { data, error } = await q
  check(error)
  return (data ?? []).map(mapSpin)
}

async function history(randomizer: RandomizerId, excludeId?: string): Promise<SpinHistoryEntry[]> {
  const since = new Date(Date.now() - 91 * DAY).toISOString()
  const { data, error } = await createServiceClient()
    .from('randomizer_spins')
    .select('id, status, primary_value, combo, meta, picks, created_at')
    .eq('randomizer', randomizer)
    .neq('status', 'rejected')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
  check(error)
  return (data ?? [])
    .filter((r: any) => r.id !== excludeId)
    .map((r: any) => ({
      id: r.id,
      status: r.status,
      primary: r.primary_value,
      combo: r.combo,
      meta: r.meta ?? {},
      picks: r.picks,
      createdAt: r.created_at,
    }))
}

export interface CreateSpinInput {
  randomizer: RandomizerId
  /** The spin on screen: locks keep its values, and a re-spin rejects it. */
  from?: string | null
  locks?: string[]
  /** Reject `from` and draw again. */
  respin?: boolean
  /** Why `from` was rejected (decision D6). */
  reason?: string | null
  pair?: boolean
  sequence?: boolean
  /** 'admin', 'mcp', 'api'. */
  createdBy: string
  /** Replay a seed instead of drawing a fresh one. */
  seed?: number
}

export async function createSpin(input: CreateSpinInput): Promise<SpinRecord> {
  const db = createServiceClient()
  let prev: SpinRecord | null = null
  if (input.from) {
    prev = await getSpin(input.from)
    if (!prev) throw new SpinError(`no spin ${input.from}`, 404)
    if (prev.randomizer !== input.randomizer) throw new SpinError(`spin ${prev.id} is a ${prev.randomizer} spin`, 400)
  }
  if (input.respin) {
    if (!prev) throw new SpinError('a re-spin needs the spin it replaces (from)', 400)
    if (prev.status === 'rejected') throw new SpinError(`spin ${prev.id} was already rejected`, 409)
    if (prev.status === 'published') throw new SpinError(`spin ${prev.id} already shipped a story; spin a new one instead`, 409)
  }

  const seed = input.seed ?? randomSeed()
  const [past, heat] = await Promise.all([
    // The spin being re-spun is about to be rejected: it must not block its own replacement.
    history(input.randomizer, input.respin ? prev?.id : undefined),
    input.randomizer === 'desk' ? listDeskHeat() : Promise.resolve([] as DeskHeatRow[]),
  ])
  const reason = input.reason?.trim().slice(0, 200) || null
  const result = draw({
    randomizer: input.randomizer,
    seed,
    history: past,
    prev,
    locks: input.locks,
    pair: input.pair,
    sequence: input.sequence,
    heat,
  })
  if (input.respin && prev) {
    result.rules.unshift({
      tag: 're-spin',
      kind: 'block',
      text: `Previous result (${prev.summary}) logged as rejected${reason ? `: ${reason}` : ''}.`,
    })
  }

  const { data, error } = await db
    .from('randomizer_spins')
    .insert({
      randomizer: input.randomizer,
      seed: seedHex(seed),
      reels: result.reels,
      picks: result.picks,
      subject: result.subject,
      primary_value: result.primary,
      combo: result.combo,
      summary: result.summary,
      rules: result.rules,
      meta: result.meta,
      options: { locks: input.locks ?? [], pair: !!input.pair, sequence: !!input.sequence },
      respin_of: input.respin ? prev!.id : null,
      created_by: input.createdBy,
    })
    .select('*')
    .single()
  check(error)

  if (input.respin && prev) {
    const { error: rejectError } = await db
      .from('randomizer_spins')
      .update({ status: 'rejected', rejected_reason: reason, updated_at: new Date().toISOString() })
      .eq('id', prev.id)
    check(rejectError)
  }
  return mapSpin(data)
}

/** Whether a story tied to this spin may go public: gated randomizers wait for an approved hero insight. */
export function spinAllowsPublish(spin: Pick<SpinRecord, 'randomizer' | 'status'>): boolean {
  return !RANDOMIZER_META[spin.randomizer].gated || spin.status === 'approved' || spin.status === 'published'
}

async function update(id: string, patch: Record<string, unknown>): Promise<SpinRecord> {
  const { data, error } = await createServiceClient()
    .from('randomizer_spins')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  check(error)
  return mapSpin(data)
}

async function requireSpin(id: string): Promise<SpinRecord> {
  const spin = await getSpin(id)
  if (!spin) throw new SpinError(`no spin ${id}`, 404)
  return spin
}

/**
 * Save the research file. The status follows the HERO INSIGHT section: none
 * yet is `researching`; one is `insight_review` for gated randomizers (or
 * stays `approved` when the approved sentence is unchanged) and `approved`
 * for the Desk.
 */
export async function saveSpinResearch(id: string, markdown: string): Promise<SpinRecord> {
  const spin = await requireSpin(id)
  if (spin.status === 'rejected') throw new SpinError(`spin ${id} was rejected; research a live spin`, 409)
  if (markdown.length > 400_000) throw new SpinError('research file is over 400 KB', 413)
  const hero = extractHeroInsight(markdown)
  let status: SpinStatus
  if (spin.status === 'published') status = 'published'
  else if (!hero) status = 'researching'
  else if (!RANDOMIZER_META[spin.randomizer].gated) status = 'approved'
  else status = spin.status === 'approved' && spin.heroInsight === hero ? 'approved' : 'insight_review'
  return update(id, { research_md: markdown, hero_insight: hero, status })
}

/** The human gate on the hero insight (decision D4). */
export async function reviewSpin(
  id: string,
  { action, note, by }: { action: 'approve' | 'send_back'; note?: string | null; by?: string | null },
): Promise<SpinRecord> {
  const spin = await requireSpin(id)
  if (spin.status === 'rejected' || spin.status === 'published') {
    throw new SpinError(`spin ${id} is ${spin.status}; nothing to review`, 409)
  }
  if (action === 'approve') {
    if (!spin.heroInsight) throw new SpinError('there is no hero insight to approve yet', 409)
    return update(id, { status: 'approved', review_note: note?.trim() || null, reviewed_by: by ?? null })
  }
  if (!note?.trim()) throw new SpinError('say what to fix when sending an insight back', 400)
  return update(id, { status: 'researching', review_note: note.trim(), reviewed_by: by ?? null })
}

/** Record the story a spin shipped (the publish API calls this). */
export async function linkSpinStory(id: string, slug: string, published: boolean): Promise<SpinRecord> {
  const spin = await requireSpin(id)
  const status: SpinStatus = published && spinAllowsPublish(spin) ? 'published' : spin.status
  return update(id, { story_slug: slug, status })
}

/* ---------- Desk heat ---------- */

function mapHeat(r: any): DeskHeatRow {
  return {
    subId: r.sub_id,
    heat: r.heat,
    heatUpdated: r.heat_updated ?? null,
    topHeadlines: Array.isArray(r.top_headlines) ? r.top_headlines : [],
    refreshStatus: r.refresh_status === 'failed' ? 'failed' : 'ok',
    refreshError: r.refresh_error ?? null,
    refreshedBy: r.refreshed_by ?? null,
  }
}

export async function listDeskHeat(): Promise<DeskHeatRow[]> {
  const { data, error } = await createServiceClient().from('desk_heat').select('*')
  check(error)
  return (data ?? []).map(mapHeat)
}

export interface HeatRefresh {
  subId: string
  heat: number
  topHeadlines?: DeskHeadline[]
}

export interface HeatFailure {
  subId: string
  error: string
}

function knownSub(subId: string): boolean {
  return DESK.sub_industries.some((s) => s.id === subId)
}

function cleanHeadlines(list: DeskHeadline[] | undefined): DeskHeadline[] {
  return (list ?? [])
    .filter((h) => h && typeof h.title === 'string' && typeof h.url === 'string' && /^\d{4}-\d{2}-\d{2}/.test(String(h.date)))
    .map((h) => ({ title: h.title.trim().slice(0, 300), url: h.url.trim(), date: String(h.date).slice(0, 10) }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
}

/**
 * Write a heat refresh: successes get a new heat, headlines and timestamp;
 * failures are recorded (keeping the last good heat) so the admin shows them
 * and the draw turns those spins Evergreen.
 */
export async function refreshDeskHeat(
  { refreshed = [], failed = [] }: { refreshed?: HeatRefresh[]; failed?: HeatFailure[] },
  by: string,
): Promise<DeskHeatRow[]> {
  const unknown = [...refreshed, ...failed].map((r) => r.subId).filter((id) => !knownSub(id))
  if (unknown.length) throw new SpinError(`unknown sub-industry: ${unknown.join(', ')}`, 400)
  const now = new Date().toISOString()
  const db = createServiceClient()
  const existing = new Map((await listDeskHeat()).map((h) => [h.subId, h]))

  const rows = [
    ...refreshed.map((r) => ({
      sub_id: r.subId,
      heat: Math.round(Math.min(100, Math.max(0, r.heat))),
      heat_updated: now,
      top_headlines: cleanHeadlines(r.topHeadlines),
      refresh_status: 'ok',
      refresh_error: null,
      refreshed_by: by,
      updated_at: now,
    })),
    ...failed.map((f) => {
      const prev = existing.get(f.subId)
      const seed = DESK.sub_industries.find((s) => s.id === f.subId)!
      return {
        sub_id: f.subId,
        heat: prev?.heat ?? seed.heat,
        heat_updated: prev?.heatUpdated ?? null,
        top_headlines: prev?.topHeadlines ?? [],
        refresh_status: 'failed',
        refresh_error: f.error.slice(0, 300),
        refreshed_by: by,
        updated_at: now,
      }
    }),
  ]
  if (!rows.length) return [...existing.values()]
  const { error } = await db.from('desk_heat').upsert(rows, { onConflict: 'sub_id' })
  check(error)
  return listDeskHeat()
}
