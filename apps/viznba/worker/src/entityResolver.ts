/**
 * Maps the summariser's free-text entity names ("LeBron", "Sixers",
 * "JJ Redick") to canonical rows in viznba_teams / viznba_players /
 * viznba_coaches.
 *
 * Strategy, per type, cheap → loose:
 *   1. Exact key: display name, suffix-less name ("Jaren Jackson"), curated
 *      and DB aliases, and for teams the nickname / location / abbreviation.
 *   2. Last name alone — only when exactly one entity of that type has it.
 *   3. Same last name + same first initial ("Nic Claxton" → Nicolas Claxton,
 *      "C. Carr" → Cameron Carr), again only when that narrows to one.
 *
 * A key that points at more than one entity is never resolved — "Williams"
 * or "Los Angeles" drop rather than guess. When an exact key is shared by an
 * active and an inactive player, the active one wins.
 *
 * Unknown names are logged as `[entity-miss]` and never auto-created: the
 * canonical set comes from the ESPN seed (seedRoster.ts) only.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { AMBIGUOUS_TEAM_KEYS } from './aliases'

export type EntityType = 'team' | 'player' | 'coach'

/** A candidate tag: the canonical row a name resolved to, plus the surface
 *  form that produced it. The Jev gate phrases its question with `name`;
 *  `sourceName` is what miss logs and alias fixes are written against. */
export type ResolvedEntity = {
  type: EntityType
  id: string
  /** Canonical display name, e.g. "Philadelphia 76ers". */
  name: string
  /** The name as extracted from the article, e.g. "Sixers". */
  sourceName: string
}

export type ExtractedEntities = { teams: string[]; players: string[]; coaches: string[] }

export type TeamRow = {
  team_id: string
  abbreviation: string
  location: string
  name: string
  display_name: string
  aliases: string[] | null
}
export type PersonRow = {
  id: string
  first_name: string
  last_name: string
  display_name: string
  aliases: string[] | null
  active: boolean
}

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])

/** Lowercase, strip diacritics and dots/apostrophes ("D'Angelo" → "dangelo",
 *  "P.J." → "pj"), collapse everything else to single spaces. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** `norm` without a trailing generational suffix: "jaren jackson jr" → "jaren jackson". */
function stripSuffix(n: string): string {
  const parts = n.split(' ')
  while (parts.length > 1 && SUFFIXES.has(parts[parts.length - 1])) parts.pop()
  return parts.join(' ')
}

type Entry = { id: string; name: string; active: boolean }

/** Key → every entity that claims it. Ambiguity is decided at lookup time. */
class KeyIndex {
  private map = new Map<string, Map<string, Entry>>()

  add(key: string, entry: Entry) {
    const k = stripSuffix(norm(key))
    if (!k) return
    let bucket = this.map.get(k)
    if (!bucket) this.map.set(k, (bucket = new Map()))
    bucket.set(entry.id, entry)
  }

  /** The single entity behind `key`, preferring the only active one. */
  get(key: string): Entry | null {
    const bucket = this.map.get(key)
    if (!bucket) return null
    const all = [...bucket.values()]
    if (all.length === 1) return all[0]
    const active = all.filter((e) => e.active)
    return active.length === 1 ? active[0] : null
  }
}

type PersonIndex = {
  exact: KeyIndex
  lastName: KeyIndex
  /** "c carr" → by first initial + last name. */
  initialLast: KeyIndex
}

function buildPersonIndex(rows: PersonRow[]): PersonIndex {
  const idx: PersonIndex = { exact: new KeyIndex(), lastName: new KeyIndex(), initialLast: new KeyIndex() }
  for (const r of rows) {
    const entry = { id: r.id, name: r.display_name, active: r.active }
    idx.exact.add(r.display_name, entry)
    idx.exact.add(`${r.first_name} ${r.last_name}`, entry)
    for (const a of r.aliases ?? []) idx.exact.add(a, entry)
    const last = stripSuffix(norm(r.last_name))
    idx.lastName.add(last, entry)
    const initial = norm(r.first_name).charAt(0)
    if (initial) idx.initialLast.add(`${initial} ${last}`, entry)
  }
  return idx
}

function resolvePerson(idx: PersonIndex, raw: string): Entry | null {
  const n = stripSuffix(norm(raw))
  if (!n) return null
  const exact = idx.exact.get(n)
  if (exact) return exact
  const parts = n.split(' ')
  if (parts.length === 1) return idx.lastName.get(n)
  // "Nic Claxton", "C. Carr", "Cam Johnson": first initial + last name.
  return idx.initialLast.get(`${parts[0].charAt(0)} ${parts.slice(1).join(' ')}`)
}

export type ResolverIndex = {
  teams: KeyIndex
  players: PersonIndex
  coaches: PersonIndex
}

export function buildIndex(data: {
  teams: TeamRow[]
  players: PersonRow[]
  coaches: PersonRow[]
}): ResolverIndex {
  const teams = new KeyIndex()
  const ambiguous = new Set(AMBIGUOUS_TEAM_KEYS.map((k) => stripSuffix(norm(k))))
  const addTeam = (key: string, entry: Entry) => {
    if (!ambiguous.has(stripSuffix(norm(key)))) teams.add(key, entry)
  }
  for (const t of data.teams) {
    const entry = { id: t.team_id, name: t.display_name, active: true }
    addTeam(t.display_name, entry)
    addTeam(t.name, entry)
    addTeam(t.location, entry)
    addTeam(t.abbreviation, entry)
    for (const a of t.aliases ?? []) addTeam(a, entry)
  }
  return {
    teams,
    players: buildPersonIndex(data.players),
    coaches: buildPersonIndex(data.coaches),
  }
}

/** Pure resolution against a prebuilt index; `onMiss` sees every unresolved name. */
export function resolveWithIndex(
  idx: ResolverIndex,
  extracted: ExtractedEntities,
  onMiss: (type: EntityType, name: string) => void = () => {},
): ResolvedEntity[] {
  const out: ResolvedEntity[] = []
  const seen = new Set<string>()
  const push = (type: EntityType, sourceName: string, hit: Entry | null) => {
    if (!hit) return onMiss(type, sourceName)
    const key = `${type}:${hit.id}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ type, id: hit.id, name: hit.name, sourceName })
  }
  for (const n of extracted.teams) push('team', n, idx.teams.get(stripSuffix(norm(n))))
  for (const n of extracted.players) push('player', n, resolvePerson(idx.players, n))
  for (const n of extracted.coaches) push('coach', n, resolvePerson(idx.coaches, n))
  return out
}

let cached: ResolverIndex | null = null

/** PostgREST caps a response at the project's max-rows (1000 by default),
 *  and inactive players accumulate season over season — so page. */
const PAGE_SIZE = 1000

export async function selectAll<T>(sb: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await sb
      .from(table)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`viznba resolver: loading ${table} failed: ${error.message}`)
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

async function loadIndex(sb: SupabaseClient): Promise<ResolverIndex> {
  if (cached) return cached
  const [teams, players, coaches] = await Promise.all([
    selectAll<TeamRow>(sb, 'viznba_teams', 'team_id, abbreviation, location, name, display_name, aliases'),
    selectAll<PersonRow>(
      sb,
      'viznba_players',
      'id:player_id, first_name, last_name, display_name, aliases, active',
    ),
    selectAll<PersonRow>(
      sb,
      'viznba_coaches',
      'id:coach_id, first_name, last_name, display_name, aliases, active',
    ),
  ])
  if (teams.length === 0) {
    throw new Error('viznba resolver: viznba_teams is empty — run `pnpm seed:roster` first')
  }
  cached = buildIndex({ teams, players, coaches })
  return cached
}

export async function resolveEntities(
  sb: SupabaseClient,
  extracted: ExtractedEntities,
): Promise<ResolvedEntity[]> {
  const idx = await loadIndex(sb)
  return resolveWithIndex(idx, extracted, (type, name) =>
    console.log(`[entity-miss] ${type}: ${JSON.stringify(name)}`),
  )
}

export function resetCache() {
  cached = null
}
