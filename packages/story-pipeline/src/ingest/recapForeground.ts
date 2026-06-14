/**
 * Recap → story foreground ingestion.
 *
 * Daily-recap markdown embeds footshorts viz modules as `fs:` JSON fences (see
 * @vismay/viz-engine recapFences). Those fences carry REAL, validated configs —
 * actual fixtures, the live league table, the bracket — built by the recap
 * generator from Supabase data.
 *
 * When the recap is one of a story's sources, the model (steered by the
 * footshorts pack guidance) decides WHERE an `fs:match-card` / `fs:standings-table`
 * / `fs:bracket` belongs and emits a layer of that type — but with config it had
 * to guess from prose. This stage swaps the model's guess for the recap's real
 * config, matching by module type in document order. The model owns placement;
 * the recap owns the data.
 *
 * Deterministic, side-effect-free except for the in-place body mutation it
 * performs on the returned story's sections. Reports what it couldn't place
 * rather than dropping silently.
 */

// Deep import (not the barrel): recapFences is pure TS with no React/CSS graph,
// so this stays importable from the standalone tsx pipeline scripts/tests.
import { extractFsDirectives, type FsDirective } from '@vismay/viz-engine/src/lib/recapFences'
import type { GeneratedStory, GeneratedSection, SourceDoc } from '../types'

/** A foreground layer object carrying a `type`, as it sits in a section body. */
type ForegroundLayer = Record<string, unknown> & { type?: unknown }

/**
 * Walk a section body's `foreground` (single layer, array, or a regions map) and
 * return mutable references to every `fs:` layer, in document order.
 */
function collectFsLayers(body: Record<string, unknown>): ForegroundLayer[] {
  const out: ForegroundLayer[] = []
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const n of node) visit(n)
      return
    }
    if (!node || typeof node !== 'object') return
    const obj = node as Record<string, unknown>
    if (typeof obj.type === 'string' && obj.type.startsWith('fs:')) out.push(obj as ForegroundLayer)
    // Foreground-regions shape: { layout?, regions: { key: layer | layer[] } }.
    if (obj.regions && typeof obj.regions === 'object') {
      for (const v of Object.values(obj.regions as Record<string, unknown>)) visit(v)
    }
  }
  visit(body.foreground)
  return out
}

/**
 * Replace a foreground layer's config in place with a recap directive's config,
 * preserving the engine-level `style` field the model may have set on the layer.
 */
function applyConfig(layer: ForegroundLayer, directive: FsDirective): void {
  const style = layer.style
  for (const key of Object.keys(layer)) delete layer[key]
  Object.assign(layer, directive.config)
  if (style !== undefined) layer.style = style
}

/** Pull every fs: directive out of a set of sources (or raw strings). */
export function collectRecapDirectives(sources: Array<SourceDoc | string>): FsDirective[] {
  const out: FsDirective[] = []
  for (const src of sources) {
    const body = typeof src === 'string' ? src : src.body
    out.push(...extractFsDirectives(body))
  }
  return out
}

/** Notable string values in a directive config that, if present in a section's
 *  text, signal the directive belongs there (team names, competition, title). */
function directiveKeywords(d: FsDirective): string[] {
  const words: string[] = []
  const pushStr = (v: unknown) => {
    if (typeof v === 'string' && v.length > 1) words.push(v)
  }
  const c = d.config
  pushStr(c.home)
  pushStr(c.away)
  pushStr(c.competition)
  pushStr(c.title)
  // Walk nested fixtures / rows for team names (bracket, standings, match-tile/row).
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!node || typeof node !== 'object') return
    const o = node as Record<string, unknown>
    pushStr(o.name)
    pushStr(o.home_team_name)
    pushStr(o.away_team_name)
    for (const v of Object.values(o)) if (v && typeof v === 'object') visit(v)
  }
  visit(c.fixtures)
  visit(c.rows)
  return words
}

/** Score how strongly a directive matches a section's text (keyword hits). */
function matchScore(d: FsDirective, sectionText: string): number {
  const hay = sectionText.toLowerCase()
  let score = 0
  for (const w of directiveKeywords(d)) if (hay.includes(w.toLowerCase())) score++
  return score
}

/**
 * Fill the `fs:` foreground layers the model placed in ONE section's body with
 * real recap configs, choosing each by content overlap with the section's text
 * (heading + prose). Stateless — suitable for the per-section canvas compose
 * route where sections generate independently. A layer whose type has candidate
 * directives but no text overlap falls back to the first candidate, so real data
 * still flows when there's a single match-card / table. Mutates `body` in place;
 * returns how many layers were filled.
 */
export function graftSectionBody(
  body: Record<string, unknown>,
  directives: FsDirective[],
  sectionText: string,
): number {
  if (!body || typeof body !== 'object' || directives.length === 0) return 0
  let applied = 0
  for (const layer of collectFsLayers(body)) {
    const candidates = directives.filter((d) => d.type === layer.type)
    if (candidates.length === 0) continue
    let best = candidates[0]!
    let bestScore = -1
    for (const d of candidates) {
      const s = matchScore(d, sectionText)
      if (s > bestScore) {
        bestScore = s
        best = d
      }
    }
    applyConfig(layer, best)
    applied++
  }
  return applied
}

export interface GraftRecapResult {
  /** The same story object, with matched section foregrounds mutated in place. */
  story: GeneratedStory
  /** How many model-placed fs: layers received a real recap config. */
  applied: number
  /** Directives with no matching layer to fill — surfaced, never silently dropped. */
  unused: FsDirective[]
}

/**
 * Graft the `fs:` configs found in `sources` onto matching foreground layers in
 * `story`. Matching is by module type, consumed in document order: the Nth
 * `fs:match-card` directive fills the Nth `fs:match-card` layer the model placed.
 *
 * No-op (returns the story unchanged, `applied: 0`) when the sources carry no
 * `fs:` fences — so it's safe to call on every compose run regardless of vertical.
 */
export function graftRecapForeground(
  story: GeneratedStory,
  sources: Array<SourceDoc | string>,
): GraftRecapResult {
  // Pull every directive out of the source bodies, bucketed into per-type queues
  // that preserve document order.
  const queues = new Map<string, FsDirective[]>()
  for (const src of sources) {
    const body = typeof src === 'string' ? src : src.body
    for (const d of extractFsDirectives(body)) {
      const q = queues.get(d.type) ?? []
      q.push(d)
      queues.set(d.type, q)
    }
  }
  if (queues.size === 0) return { story, applied: 0, unused: [] }

  let applied = 0
  for (const section of story.sections as GeneratedSection[]) {
    if (!section.body || typeof section.body !== 'object') continue
    for (const layer of collectFsLayers(section.body)) {
      const type = layer.type as string
      const q = queues.get(type)
      if (q && q.length > 0) {
        applyConfig(layer, q.shift()!)
        applied++
      }
    }
  }

  const unused: FsDirective[] = []
  for (const q of queues.values()) unused.push(...q)
  return { story, applied, unused }
}
