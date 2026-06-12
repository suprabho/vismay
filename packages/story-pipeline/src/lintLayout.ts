/**
 * Layout-lint — catch the class of bug behind the overloaded cover WITHOUT
 * rendering a pixel.
 *
 * The renderer (viz-engine's ForegroundLayoutSlot) walks the chosen LAYOUT's
 * regions and pulls each region's layers FROM the body. Two consequences fall
 * straight out of that, and this lints for both against viz-engine's own
 * foreground-layout registry (so the rules can never drift from the renderer):
 *
 *   • DROP   — a body region the layout doesn't define is never iterated, so its
 *              layers silently don't render (e.g. `lead`/`body` under
 *              `hero-full-bleed`, which only defines `default`).
 *   • STACK  — a single-region / stacking layout (hero-full-bleed, single-fill,
 *              free) pours every layer into one full-area box, and any region
 *              holding >1 layer piles them into one box (overflow / overlap).
 *
 * Plus an outline-level check: a cover/hero stub planned onto a stacking layout
 * will pile a stat + text together — the exact failure we saw on the Adani cover.
 */

import { getForegroundLayout } from './vizEngine'
import { sectionKindsFor } from './schema'
import type { StoryOutline, GeneratedSection } from './types'

/** ForegroundLayoutSlot's fallback when a layout name is unknown/absent. */
const DEFAULT_LAYOUT = 'split-37-63-two-row'

const COVER_KINDS = new Set(['cover', 'hero'])

export type LintSeverity = 'drop' | 'overlap' | 'unknown' | 'missing'

export interface LayoutLintIssue {
  section: string
  severity: LintSeverity
  message: string
}

/** A layout's content regions, excluding the always-present full-area `default`. */
function namedRegions(name: string): string[] | null {
  const def = getForegroundLayout(name)
  return def ? Object.keys(def.regions ?? {}).filter((k) => k !== 'default') : null
}

/** A layout whose only box is the full-area `default` — every layer stacks. */
function isStacking(name: string): boolean {
  const named = namedRegions(name)
  return named !== null && named.length === 0
}

function asLayers(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

/**
 * Lint one normalised `foreground` value (the shape `normalizeForeground` emits:
 * a `{ layout?, regions }` map, a flat array, or a single layer object).
 */
function lintForeground(fg: unknown, section: string): LayoutLintIssue[] {
  const issues: LayoutLintIssue[] = []
  if (!fg || typeof fg !== 'object') return issues

  // A flat list folds into `single-fill`'s lone `default` box — >1 layer stacks.
  if (Array.isArray(fg)) {
    if (fg.length > 1) {
      issues.push({
        section,
        severity: 'overlap',
        message: `${fg.length} flat layers render in single-fill \`default\` and stack`,
      })
    }
    return issues
  }

  const obj = fg as Record<string, unknown>
  const regions = obj.regions
  // A single layer mapping (has `type`, no `regions`) is always fine.
  if (!regions || typeof regions !== 'object') return issues

  const layoutName = typeof obj.layout === 'string' ? obj.layout : undefined
  const resolved = layoutName ?? DEFAULT_LAYOUT
  if (layoutName && !getForegroundLayout(layoutName)) {
    issues.push({
      section,
      severity: 'unknown',
      message: `unknown layout '${layoutName}' → renderer falls back to '${DEFAULT_LAYOUT}'`,
    })
  }
  const def = getForegroundLayout(resolved)
  const realRegions = def ? Object.keys(def.regions ?? {}) : ['default']
  const named = realRegions.filter((r) => r !== 'default')

  for (const [rname, raw] of Object.entries(regions as Record<string, unknown>)) {
    const n = asLayers(raw).length
    if (!realRegions.includes(rname)) {
      issues.push({
        section,
        severity: 'drop',
        message: `region '${rname}' is not in layout '${resolved}' (${named.join(' · ') || 'default only'}) → ${n} layer(s) won't render`,
      })
    } else if (n > 1) {
      issues.push({
        section,
        severity: 'overlap',
        message: `region '${rname}' holds ${n} layers → they stack in one box (overflow/overlap risk)`,
      })
    }
  }
  return issues
}

/** A vertical-namespaced layer type, e.g. `f1:race-card`. */
const VERTICAL_TYPE_RE = /^\w+:/

/** Every layer `type` in a normalised foreground value (flat list, single
 *  layer mapping, or `{ layout?, regions }`). */
function collectForegroundTypes(fg: unknown): string[] {
  if (!fg || typeof fg !== 'object') return []
  const typeOf = (v: unknown): string | null =>
    v && typeof v === 'object' && typeof (v as { type?: unknown }).type === 'string'
      ? ((v as { type: string }).type)
      : null
  if (Array.isArray(fg)) return fg.map(typeOf).filter((t): t is string => !!t)
  const single = typeOf(fg)
  if (single) return [single]
  const regions = (fg as { regions?: unknown }).regions
  if (!regions || typeof regions !== 'object') return []
  const types: string[] = []
  for (const raw of Object.values(regions as Record<string, unknown>)) {
    for (const l of asLayers(raw)) {
      const t = typeOf(l)
      if (t) types.push(t)
    }
  }
  return types
}

export interface LintBodyOptions {
  /** The vertical layer types this story's desk offers (DomainPack extras).
   *  A namespaced type outside this set is flagged — a vizmaya story must
   *  never carry `f1:`/`fs:` layers. */
  extraTypes?: readonly string[]
}

/** Lint ONE generated section's normalised `body` (foreground placement +
 *  vertical-type isolation). */
export function lintSectionBody(
  body: Record<string, unknown>,
  section: string,
  opts: LintBodyOptions = {},
): LayoutLintIssue[] {
  const issues = lintForeground(body.foreground, section)
  const allowed = new Set(opts.extraTypes ?? [])
  for (const t of collectForegroundTypes(body.foreground)) {
    if (VERTICAL_TYPE_RE.test(t) && !allowed.has(t)) {
      issues.push({
        section,
        severity: 'unknown',
        message: `vertical layer type '${t}' is not offered to this story's desk — use a core layer or a type from its menu`,
      })
    }
  }
  return issues
}

/** Lint every section of an assembled story. */
export function lintStory(
  sections: GeneratedSection[],
  opts: LintBodyOptions = {},
): LayoutLintIssue[] {
  return sections.flatMap((s) => lintSectionBody(s.body, s.heading, opts))
}

/**
 * Lint the OUTLINE's planned layouts. A stub carries a layout NAME but no body,
 * so the stub-level checks are deliberately conservative — only what's
 * structurally certain:
 *   - the layout name is real (else the renderer falls back to the default), and
 *   - a cover/hero doesn't feature a CHART on a single-box layout (a chart has no
 *     region to sit in there, so it collides with the title overlay).
 * A cover that carries just one stat or one line is FINE on hero-full-bleed —
 * single layer, nothing to stack — so those are not flagged here; the
 * rendered-body lint (`lintSectionBody`) is the authority on actual pile-ups.
 */
export function lintOutline(outline: StoryOutline): LayoutLintIssue[] {
  const issues: LayoutLintIssue[] = []
  const mapKinds = sectionKindsFor('map')
  // Every story opens with a title card — a stat/text opener drops the reader
  // in mid-arc (the outline prompt demands a cover; this catches the misses).
  const first = outline.sections[0]
  if (first && !COVER_KINDS.has(first.kind)) {
    issues.push({
      section: first.heading,
      severity: 'missing',
      message: `story opens with kind '${first.kind}' — the first section should be a cover/hero title card`,
    })
  }
  // Map cold-open: the beat right after the hero is a stat — the story's single
  // most arresting figure as a giant number (the kashmir opener pattern).
  const second = outline.sections[1]
  if (outline.format === 'map' && second && second.kind !== 'stat') {
    issues.push({
      section: second.heading,
      severity: 'missing',
      message: `map story's second section is kind '${second.kind}' — the beat after the hero must be a stat cold-open (heading IS the figure, e.g. "4,021,616")`,
    })
  }
  // Headings are markdown anchors and share ONE namespace across sections AND
  // sub-beats — a duplicate silently steals the other's prose.
  const seen = new Set<string>()
  for (const s of outline.sections) {
    for (const h of [s.heading, ...(s.subsections ?? []).map((x) => x.heading)]) {
      const key = h.trim()
      if (seen.has(key)) {
        issues.push({
          section: h,
          severity: 'drop',
          message: `duplicate heading '${h}' — anchors collide and one block loses its prose`,
        })
      }
      seen.add(key)
    }
  }
  for (const s of outline.sections) {
    // MAP planning guard: a map section's prose lives in the scroll rail, which a
    // deck `kind` or a named `layout` (a foreground panel over the map) would
    // suppress — leaving the prose unrendered. Map sections carry the visual on
    // the map itself (pins / choropleth) + a chart referenced by id.
    if (outline.format === 'map') {
      if (!mapKinds.includes(s.kind)) {
        issues.push({
          section: s.heading,
          severity: 'drop',
          message: `map section kind '${s.kind}' suppresses the prose rail → use ${mapKinds.join(' / ')}`,
        })
      }
      if (s.layout) {
        issues.push({
          section: s.heading,
          severity: 'drop',
          message: `map section plans foreground layout '${s.layout}' → a panel over the map suppresses the prose rail; drop it`,
        })
      }
      // Region-awareness: a map section with no planned geo leaves the camera to
      // be invented downstream — the story stops travelling through its geography.
      if (!s.geo) {
        issues.push({
          section: s.heading,
          severity: 'missing',
          message: `map section plans no geo (focus + center + zoom) → the camera will be invented downstream`,
        })
      }
      // Numeric stats only: a map `stat` section renders its HEADING as the giant
      // figure (StatPanel), so a phrase heading becomes a giant sentence.
      if (s.kind === 'stat' && !/\d/.test(s.heading)) {
        issues.push({
          section: s.heading,
          severity: 'missing',
          message: `map stat section's heading renders as the giant figure but contains no number — make the heading the stat itself (e.g. "18.7 GW")`,
        })
      }
      // Sub-beats: each needs its camera dive, and never its own choropleth
      // (the parent's regions are the shared context the beats explore).
      for (const sub of s.subsections ?? []) {
        if (!sub.geo) {
          issues.push({
            section: `${s.heading} › ${sub.heading}`,
            severity: 'missing',
            message: `sub-beat plans no geo (the camera dive) → it will sit on the parent's framing`,
          })
        }
      }
    }
    if (s.layout && !getForegroundLayout(s.layout)) {
      issues.push({
        section: s.heading,
        severity: 'unknown',
        message: `planned layout '${s.layout}' is not a registered layout`,
      })
      continue
    }
    const stacking = !s.layout || isStacking(s.layout)
    if (COVER_KINDS.has(s.kind) && stacking && s.chartId) {
      issues.push({
        section: s.heading,
        severity: 'overlap',
        message: `cover/hero features a chart (${s.chartId}) on single-box layout '${s.layout ?? 'flat'}' — a chart needs its own region; move it to a later section or use a separated layout`,
      })
    }
  }
  return issues
}

/** One-line formatter for console output. */
export function formatLintIssue(i: LayoutLintIssue): string {
  return `⚠ ${i.severity.toUpperCase()} · ${i.section} — ${i.message}`
}
