/**
 * Server-side enrichment of footshorts story configs.
 *
 * Walks every section's foreground for `fs:match-card` and `fs:match-tile`
 * layers, resolves the teams they name against the Supabase `entities` table
 * (alias-aware: `Spurs`, `Tottenham`, `Tottenham Hotspur FC` all find
 * `tottenham-hotspur`), and injects `crest_url` + `primary_color`:
 *
 *   - `fs:match-card` gets the `homeCrestUrl` / `awayCrestUrl` / `homeColor` /
 *     `awayColor` fields the match-card layouts already understand.
 *   - `fs:match-tile` carries whole `FixtureRow`s; each `home` / `away` ref
 *     gets its `crest_url` / `primary_color` filled where the YAML left null.
 *
 * Precedence at render time:
 *   1. YAML-explicit value (already in the config) — untouched.
 *   2. Supabase data (injected here) — what the Asset Studio edits.
 *   3. Bundled palette in `@vismay/footshorts-viz/src/data/teams.ts`.
 *
 * This is a no-op when Supabase env vars are missing or the lookup fails —
 * the story still renders, just from the bundled palette / monogram. Same
 * when the story isn't a footshorts story or carries no match layers.
 */

import type { StoryConfig } from '@vismay/viz-engine'
import { createServiceClient } from './supabase'
import { resolveTeamsByLabel, type TeamBrandRow } from './footshortsData'

const FS_MATCH_CARD = 'fs:match-card'
const FS_MATCH_TILE = 'fs:match-tile'

/** Resolves free-text team labels to entity rows, keyed by label. The default
 *  hits Supabase; tests inject a stub. */
export type TeamResolver = (labels: string[]) => Promise<Map<string, TeamBrandRow>>

interface MatchCardRaw extends Record<string, unknown> {
  type: 'fs:match-card'
  home?: unknown
  away?: unknown
  homeCrestUrl?: unknown
  awayCrestUrl?: unknown
  homeColor?: unknown
  awayColor?: unknown
}

/** A `FixtureTeamRef` as it sits in stored YAML/JSON — every field untrusted. */
interface TeamRefRaw extends Record<string, unknown> {
  slug?: unknown
  name?: unknown
  crest_url?: unknown
  primary_color?: unknown
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/** Walk the config and yield every `fs:match-card` raw object we find. */
function collectMatchCards(config: StoryConfig): MatchCardRaw[] {
  const cards: MatchCardRaw[] = []
  for (const layer of foregroundLayers(config)) {
    if (layer.type === FS_MATCH_CARD) cards.push(layer as MatchCardRaw)
  }
  return cards
}

/** Every `home` / `away` team ref inside `fs:match-tile` layers (single
 *  `fixture` or grid `fixtures`), in place so hydration mutates the config. */
function collectTileTeamRefs(config: StoryConfig): TeamRefRaw[] {
  const refs: TeamRefRaw[] = []
  for (const layer of foregroundLayers(config)) {
    if (layer.type !== FS_MATCH_TILE) continue
    const fixtures = Array.isArray(layer.fixtures) ? layer.fixtures : [layer.fixture]
    for (const fixture of fixtures) {
      if (!isObj(fixture)) continue
      for (const side of ['home', 'away'] as const) {
        const ref = fixture[side]
        if (isObj(ref)) refs.push(ref as TeamRefRaw)
      }
    }
  }
  return refs
}

function* foregroundLayers(config: StoryConfig): Generator<Record<string, unknown>> {
  for (const section of config.sections) {
    const fg = (section as { foreground?: unknown[] }).foreground
    if (!Array.isArray(fg)) continue
    for (const layer of fg) if (isObj(layer)) yield layer
  }
}

/** The label a tile ref is looked up by — its slug, else its display name. */
function tileRefLabels(ref: TeamRefRaw): string[] {
  return [asString(ref.slug), asString(ref.name)].filter((l): l is string => !!l)
}

/** Returns the distinct team labels whose card/tile still lacks a crest or a
 *  color, so the lookup only fetches what can actually be injected. */
function collectMissingLabels(cards: MatchCardRaw[], refs: TeamRefRaw[]): string[] {
  const labels = new Set<string>()
  for (const card of cards) {
    const home = asString(card.home)
    const away = asString(card.away)
    if (home && (!asString(card.homeCrestUrl) || !asString(card.homeColor))) labels.add(home)
    if (away && (!asString(card.awayCrestUrl) || !asString(card.awayColor))) labels.add(away)
  }
  for (const ref of refs) {
    if (asString(ref.crest_url) && asString(ref.primary_color)) continue
    for (const l of tileRefLabels(ref)) labels.add(l)
  }
  return Array.from(labels)
}

/** Inject `homeCrestUrl` / `homeColor` / `awayCrestUrl` / `awayColor` onto
 * each card whenever Supabase has data for that team and the YAML didn't
 * already set the override. YAML values are never overwritten. */
function applyCardHydration(cards: MatchCardRaw[], teams: Map<string, TeamBrandRow>): void {
  for (const card of cards) {
    const home = asString(card.home)
    const homeRow = home ? teams.get(home) : undefined
    if (homeRow) {
      if (!asString(card.homeCrestUrl) && homeRow.crest_url) card.homeCrestUrl = homeRow.crest_url
      if (!asString(card.homeColor) && homeRow.primary_color) card.homeColor = homeRow.primary_color
    }
    const away = asString(card.away)
    const awayRow = away ? teams.get(away) : undefined
    if (awayRow) {
      if (!asString(card.awayCrestUrl) && awayRow.crest_url) card.awayCrestUrl = awayRow.crest_url
      if (!asString(card.awayColor) && awayRow.primary_color) card.awayColor = awayRow.primary_color
    }
  }
}

/** Fill a tile ref's `crest_url` / `primary_color` where the YAML left them
 *  null. Slug is tried before name so an authored slug stays authoritative. */
function applyTileHydration(refs: TeamRefRaw[], teams: Map<string, TeamBrandRow>): void {
  for (const ref of refs) {
    const row = tileRefLabels(ref).map((l) => teams.get(l)).find(Boolean)
    if (!row) continue
    if (!asString(ref.crest_url) && row.crest_url) ref.crest_url = row.crest_url
    if (!asString(ref.primary_color) && row.primary_color) ref.primary_color = row.primary_color
  }
}

const supabaseResolver: TeamResolver = (labels) => resolveTeamsByLabel(createServiceClient(), labels)

/**
 * Enrich a footshorts story's config in place with team crests + brand colors
 * from the Supabase `entities` table. Safe to call on any config — if it
 * doesn't contain match layers, or if Supabase isn't configured, the function
 * returns the input unchanged.
 */
export async function hydrateFootshortsConfig(
  config: StoryConfig,
  resolve: TeamResolver = supabaseResolver,
): Promise<StoryConfig> {
  const cards = collectMatchCards(config)
  const refs = collectTileTeamRefs(config)
  if (cards.length === 0 && refs.length === 0) return config

  const labels = collectMissingLabels(cards, refs)
  if (labels.length === 0) return config

  let teams: Map<string, TeamBrandRow>
  try {
    teams = await resolve(labels)
  } catch {
    // Env vars missing or the lookup failed — fall back to the bundled palette at render time.
    return config
  }

  applyCardHydration(cards, teams)
  applyTileHydration(refs, teams)
  return config
}
