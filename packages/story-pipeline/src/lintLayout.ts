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

export type LintSeverity = 'drop' | 'overlap' | 'unknown'

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

/** Lint ONE generated section's normalised `body` (foreground placement only). */
export function lintSectionBody(body: Record<string, unknown>, section: string): LayoutLintIssue[] {
  return lintForeground(body.foreground, section)
}

/** Lint every section of an assembled story. */
export function lintStory(sections: GeneratedSection[]): LayoutLintIssue[] {
  return sections.flatMap((s) => lintSectionBody(s.body, s.heading))
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
