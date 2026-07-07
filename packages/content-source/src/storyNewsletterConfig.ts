/**
 * Per-story config for the HTML newsletter export. Lives in
 * `content/stories/<slug>.newsletter.yaml` (fs) or `stories.newsletter_yaml`
 * (db) — see `contentSource.readNewsletterYaml`.
 *
 * Schema:
 *
 *   subject: "Optional email subject"        # defaults to story title
 *   preheader: "Hidden inbox preview text"
 *   intro: |
 *     Optional markdown-ish intro paragraphs (blank-line separated).
 *   outro: |
 *     Optional closing paragraphs.
 *   cta:
 *     label: "Read the full interactive story"
 *     url: https://vizmaya.fyi/story/<slug>  # defaults to the story URL
 *   sections:
 *     - unit: { parentIndex: 0, subIndex: 0 }
 *       include: false                       # drop this unit entirely
 *     - unit: { parentIndex: 2, subIndex: 0 }
 *       hideMap: true                        # skip the map capture
 *       hideVisual: true                     # skip the chart / panel capture
 *       hideText: true                       # skip heading + paragraphs
 *       heading: "Override heading"
 *       paragraphs: ["Replacement paragraph"]
 *       caption: "Figure caption under the image(s)"
 *
 * Defaults are inclusive: with no config (or no entry for a unit) every unit
 * ships with its text and every visual it has. The builder UI writes this
 * file; hand-editing is equally supported.
 *
 * Unit identity is `(parentIndex, subIndex)` — same convention as
 * `<slug>.report.yaml` — so selections survive markdown edits as long as the
 * section layout is stable.
 */

import { parse as parseYaml } from 'yaml'
import type { ResolvedUnit, StoryFormat } from '@vismay/viz-engine'
// Deep-import the pure slot-resolution module, not the package root: the
// root re-exports React/mapbox/echarts components that import CSS + browser
// globals, which crash under plain node/tsx (the newsletter render worker
// runs there). Same convention as packages/story-pipeline/src/vizEngine.ts.
import {
  resolveSlotsFlat,
  isForegroundVisualType,
} from '@vismay/viz-engine/src/lib/resolveSlots'

export interface NewsletterSectionOverride {
  parentIndex: number
  subIndex: number
  include?: boolean
  hideMap?: boolean
  hideVisual?: boolean
  hideText?: boolean
  heading?: string
  paragraphs?: string[]
  caption?: string
}

export interface NewsletterCta {
  label?: string
  url?: string
}

export interface NewsletterConfig {
  subject?: string
  preheader?: string
  intro?: string
  outro?: string
  cta?: NewsletterCta
  sections: NewsletterSectionOverride[]
}

const EMPTY: NewsletterConfig = { sections: [] }

/**
 * Parse the YAML blob. Malformed input degrades to the inclusive default
 * (every unit, all visuals) rather than crashing a render.
 */
export function parseNewsletterConfig(raw: string | null): NewsletterConfig {
  if (!raw || !raw.trim()) return EMPTY
  let doc: unknown
  try {
    doc = parseYaml(raw)
  } catch {
    return EMPTY
  }
  if (!doc || typeof doc !== 'object') return EMPTY
  const d = doc as Record<string, unknown>

  const out: NewsletterConfig = { sections: [] }
  if (typeof d.subject === 'string') out.subject = d.subject
  if (typeof d.preheader === 'string') out.preheader = d.preheader
  if (typeof d.intro === 'string') out.intro = d.intro
  if (typeof d.outro === 'string') out.outro = d.outro
  if (d.cta && typeof d.cta === 'object') {
    const c = d.cta as Record<string, unknown>
    const cta: NewsletterCta = {}
    if (typeof c.label === 'string') cta.label = c.label
    if (typeof c.url === 'string') cta.url = c.url
    if (cta.label || cta.url) out.cta = cta
  }

  if (Array.isArray(d.sections)) {
    for (const entry of d.sections) {
      if (!entry || typeof entry !== 'object') continue
      const e = entry as Record<string, unknown>
      const unit = e.unit as { parentIndex?: unknown; subIndex?: unknown } | undefined
      if (
        !unit ||
        typeof unit.parentIndex !== 'number' ||
        typeof unit.subIndex !== 'number'
      ) {
        continue
      }
      const s: NewsletterSectionOverride = {
        parentIndex: unit.parentIndex,
        subIndex: unit.subIndex,
      }
      if (typeof e.include === 'boolean') s.include = e.include
      if (typeof e.hideMap === 'boolean') s.hideMap = e.hideMap
      if (typeof e.hideVisual === 'boolean') s.hideVisual = e.hideVisual
      if (typeof e.hideText === 'boolean') s.hideText = e.hideText
      if (typeof e.heading === 'string') s.heading = e.heading
      if (
        Array.isArray(e.paragraphs) &&
        e.paragraphs.every((p) => typeof p === 'string')
      ) {
        s.paragraphs = e.paragraphs as string[]
      }
      if (typeof e.caption === 'string') s.caption = e.caption
      out.sections.push(s)
    }
  }
  return out
}

/**
 * One capturable image inside a block. The key doubles as the DOM marker
 * (`data-newsletter-visual="<key>"`) on the capture surface and the storage
 * filename (`<slug>/images/<key>.png`), so the worker and the shell agree by
 * construction.
 *
 *   - `map`    the section's Mapbox camera, framed 16:9
 *   - `viz`    the section's foreground graphic (chart / image / table / …)
 *   - `panel`  a deck slide's whole composed foreground
 */
export interface NewsletterVisualRef {
  key: string
  kind: 'map' | 'viz' | 'panel'
}

export interface NewsletterBlock {
  parentIndex: number
  subIndex: number
  /** Section kind (`hero`, `stat`, `text`, deck kinds, …); default 'text'. */
  kind: string
  eyebrow?: string
  heading?: string
  subheading?: string
  /** Empty when the override sets hideText. */
  paragraphs: string[]
  caption?: string
  visuals: NewsletterVisualRef[]
  /** The source unit, for the capture shell. */
  unit: ResolvedUnit
}

export function newsletterVisualKey(
  parentIndex: number,
  subIndex: number,
  kind: NewsletterVisualRef['kind']
): string {
  return `${parentIndex}-${subIndex}-${kind}`
}

function findOverride(
  config: NewsletterConfig,
  parentIndex: number,
  subIndex: number
): NewsletterSectionOverride | undefined {
  return config.sections.find(
    (s) => s.parentIndex === parentIndex && s.subIndex === subIndex
  )
}

/**
 * Resolve the newsletter's block list from the story's units + the config.
 * Shared by the capture surface (browser) and the render worker (node) so
 * both sides derive identical visual keys.
 *
 * Visual detection is registry-free on purpose: the node worker runs without
 * any vertical's viz modules registered, so we classify from the resolved
 * layer *types* (`resolveSlotsFlat` + `isForegroundVisualType`), never from
 * `getVizModule`.
 */
export function resolveNewsletterBlocks(
  units: ResolvedUnit[],
  config: NewsletterConfig,
  format: StoryFormat
): NewsletterBlock[] {
  const isDeck = format === 'deck'
  const blocks: NewsletterBlock[] = []

  for (const unit of units) {
    const ov = findOverride(config, unit.parentIndex, unit.subIndex)
    if (ov?.include === false) continue

    const section = unit.parentConfig
    const visuals: NewsletterVisualRef[] = []

    if (isDeck) {
      // A deck slide is one composed panel; capture it whole when it carries
      // anything beyond prose (charts, images, stats, quotes, tables, …).
      const layers = resolveSlotsFlat(section).foreground
      const hasPanel = layers.some(
        (l) => l.type !== 'text' && l.type !== 'bodyText'
      )
      if (hasPanel && ov?.hideVisual !== true) {
        visuals.push({
          key: newsletterVisualKey(unit.parentIndex, unit.subIndex, 'panel'),
          kind: 'panel',
        })
      }
    } else {
      const subMap = section.subsections?.[unit.subIndex]?.map
      const center = subMap?.center ?? section.map?.center
      const zoom = subMap?.zoom ?? section.map?.zoom
      if (center && typeof zoom === 'number' && ov?.hideMap !== true) {
        visuals.push({
          key: newsletterVisualKey(unit.parentIndex, unit.subIndex, 'map'),
          kind: 'map',
        })
      }
      const layers = resolveSlotsFlat(section).foreground
      const hasViz = layers.some((l) => isForegroundVisualType(l.type))
      if (hasViz && ov?.hideVisual !== true) {
        visuals.push({
          key: newsletterVisualKey(unit.parentIndex, unit.subIndex, 'viz'),
          kind: 'viz',
        })
      }
    }

    const hideText = ov?.hideText === true
    blocks.push({
      parentIndex: unit.parentIndex,
      subIndex: unit.subIndex,
      kind: section.kind ?? 'text',
      eyebrow: hideText ? undefined : section.eyebrow,
      heading: hideText ? undefined : (ov?.heading ?? unit.heading),
      subheading: hideText ? undefined : unit.subheading,
      paragraphs: hideText ? [] : (ov?.paragraphs ?? unit.paragraphs),
      caption: ov?.caption,
      visuals,
      unit,
    })
  }

  // A block with neither text nor visuals renders nothing — drop it so the
  // HTML builder doesn't emit empty scaffolding.
  return blocks.filter(
    (b) =>
      b.visuals.length > 0 ||
      b.paragraphs.length > 0 ||
      Boolean(b.heading) ||
      Boolean(b.subheading)
  )
}
