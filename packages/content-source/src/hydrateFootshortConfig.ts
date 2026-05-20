/**
 * Server-side enrichment of footshort story configs.
 *
 * Walks every section's foreground for `fs:match-card` entries, collects the
 * unique team slugs they reference, runs a single Supabase `entities` lookup,
 * and injects `crest_url` + `primary_color` into each card as the
 * `homeCrestUrl` / `awayCrestUrl` / `homeColor` / `awayColor` fields the
 * match-card layouts already understand.
 *
 * Precedence at render time:
 *   1. YAML-explicit override (already in the config) — untouched.
 *   2. Supabase data (injected here).
 *   3. Bundled palette in `@vismay/footshort-viz/src/data/teams.ts`.
 *
 * This is a no-op when Supabase env vars are missing or the network fetch
 * fails — the story still renders, just with monogram placeholders. Same
 * when the story isn't a footshort story or carries no `fs:match-card`.
 */

import type { StoryConfig } from '@vismay/viz-engine'
import { createServiceClient } from './supabase'

const FS_MATCH_CARD = 'fs:match-card'

interface TeamRow {
  slug: string
  name: string
  crest_url: string | null
  primary_color: string | null
}

interface MatchCardRaw extends Record<string, unknown> {
  type: 'fs:match-card'
  home?: unknown
  away?: unknown
  homeCrestUrl?: unknown
  awayCrestUrl?: unknown
  homeColor?: unknown
  awayColor?: unknown
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/** Walk the config and yield every `fs:match-card` raw object we find. */
function collectMatchCards(config: StoryConfig): MatchCardRaw[] {
  const cards: MatchCardRaw[] = []
  for (const section of config.sections) {
    const fg = (section as { foreground?: unknown[] }).foreground
    if (!Array.isArray(fg)) continue
    for (const layer of fg) {
      if (layer && typeof layer === 'object' && (layer as { type?: unknown }).type === FS_MATCH_CARD) {
        cards.push(layer as MatchCardRaw)
      }
    }
  }
  return cards
}

/** Returns the distinct set of team slugs referenced by `fs:match-card`s
 * whose YAML didn't already supply both the crest and color override. */
function collectMissingSlugs(cards: MatchCardRaw[]): string[] {
  const slugs = new Set<string>()
  for (const card of cards) {
    const home = asString(card.home)
    const away = asString(card.away)
    if (home && (!asString(card.homeCrestUrl) || !asString(card.homeColor))) {
      slugs.add(slugify(home))
    }
    if (away && (!asString(card.awayCrestUrl) || !asString(card.awayColor))) {
      slugs.add(slugify(away))
    }
  }
  return Array.from(slugs)
}

/** Inject `homeCrestUrl` / `homeColor` / `awayCrestUrl` / `awayColor` onto
 * each card whenever Supabase has data for that slug and the YAML didn't
 * already set the override. YAML values are never overwritten. */
function applyHydration(cards: MatchCardRaw[], teamsBySlug: Map<string, TeamRow>): void {
  for (const card of cards) {
    const home = asString(card.home)
    if (home) {
      const row = teamsBySlug.get(slugify(home))
      if (row) {
        if (!asString(card.homeCrestUrl) && row.crest_url) card.homeCrestUrl = row.crest_url
        if (!asString(card.homeColor) && row.primary_color) card.homeColor = row.primary_color
      }
    }
    const away = asString(card.away)
    if (away) {
      const row = teamsBySlug.get(slugify(away))
      if (row) {
        if (!asString(card.awayCrestUrl) && row.crest_url) card.awayCrestUrl = row.crest_url
        if (!asString(card.awayColor) && row.primary_color) card.awayColor = row.primary_color
      }
    }
  }
}

/**
 * Enrich a footshort story's config in place with team crests + brand colors
 * from the Supabase `entities` table. Safe to call on any config — if it
 * doesn't contain `fs:match-card` layers, or if Supabase isn't configured,
 * the function returns the input unchanged.
 */
export async function hydrateFootshortConfig(config: StoryConfig): Promise<StoryConfig> {
  const cards = collectMatchCards(config)
  if (cards.length === 0) return config

  const slugs = collectMissingSlugs(cards)
  if (slugs.length === 0) return config

  let supabase
  try {
    supabase = createServiceClient()
  } catch {
    // Env vars missing — fall back to the bundled palette at render time.
    return config
  }

  const { data, error } = await supabase
    .from('entities')
    .select('slug, name, crest_url, primary_color')
    .eq('type', 'team')
    .in('slug', slugs)

  if (error || !data) return config

  const teamsBySlug = new Map<string, TeamRow>()
  for (const row of data as TeamRow[]) {
    teamsBySlug.set(row.slug, row)
  }

  applyHydration(cards, teamsBySlug)
  return config
}
