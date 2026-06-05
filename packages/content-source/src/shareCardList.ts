/**
 * Share card list builder — extracted from ShareShell so the demo curation
 * picker can run the same logic server-side.
 *
 * Mirrors the client logic 1:1: each section emits a map-title card, an
 * optional graph card, then content card(s). Hidden sections (via share
 * overrides) are skipped.
 */

import type {
  ResolvedUnit,
  ShareSectionOverride,
} from '@vismay/viz-engine'
import { resolveSlotsFlat, classifyForegroundLayers } from '@vismay/viz-engine'

export interface ShareCardEntry {
  /** Stable identity used for storage paths and share_card_ids. */
  id: string
  parentIndex: number
  subIndex: number
  /** Index within an expanded variant (split paragraphs). 0 for non-split. */
  sliceIndex: number
  variant: 'auto' | 'map-title' | 'graph'
  /**
   * For `variant === 'graph'`, which foreground subset this card renders:
   * `'stat'` (lead callout only) or `'chart'` (visual only). Omitted for the
   * combined graph card and for non-graph variants.
   */
  graphScope?: 'stat' | 'chart'
  label: string
  /** A short human description for the picker UI. */
  preview: string
}

function sliceShareParagraphs(all: string[], spec: number | [number, number]): string[] {
  if (typeof spec === 'number') return all.slice(spec, spec + 1)
  return all.slice(spec[0], spec[1])
}

function normalizeOverrideEntry(entry: string | string[]): string[] {
  return typeof entry === 'string' ? [entry] : entry
}

function previewFor(unit: ResolvedUnit, variant: ShareCardEntry['variant'], paragraph?: string): string {
  if (variant === 'map-title') return `Map · ${unit.heading || unit.parentConfig.heading || ''}`
  if (variant === 'graph') return `Graph · ${unit.heading || unit.parentConfig.heading || ''}`
  const text = (paragraph ?? unit.paragraphs[0] ?? unit.heading ?? '').replace(/\*+/g, '').trim()
  return text.slice(0, 100)
}

export function buildShareCardList(
  units: ResolvedUnit[],
  overrides: Record<string, ShareSectionOverride> | null
): ShareCardEntry[] {
  const cards: ShareCardEntry[] = []
  const seenParentsForMap = new Set<number>()

  for (const unit of units) {
    const sectionId = unit.parentConfig.id
    if (sectionId && overrides?.[sectionId]?.hide) continue

    const kind = unit.parentConfig.kind ?? 'text'
    const layoutName =
      typeof unit.parentConfig.layout === 'string' ? unit.parentConfig.layout : ''
    const isHeroLike =
      kind === 'cover' || kind === 'hero' || layoutName === 'hero-full-bleed'
    // Mirrors ShareShell.buildCardList — any non-prose foreground layer (legacy
    // `chart:` or anything in the new `foreground:` slot except text/bodyText)
    // triggers a graph card. A lead callout (bigStat…) paired with a visual
    // (chart…) splits into a stat card then a chart card.
    const { lead: leadLayers, visual: visualLayers } = classifyForegroundLayers(
      resolveSlotsFlat(unit.parentConfig).foreground
    )
    const hasVizForeground = leadLayers.length + visualLayers.length > 0
    const shareOverride = sectionId ? overrides?.[sectionId] : undefined

    const subsectionConfig = unit.parentConfig.subsections?.[unit.subIndex]
    const hasSubsectionMap = !!subsectionConfig?.map
    const isFirstForParent = !seenParentsForMap.has(unit.parentIndex)
    if (isFirstForParent || hasSubsectionMap) {
      if (isFirstForParent) seenParentsForMap.add(unit.parentIndex)
      cards.push({
        id: `${unit.parentIndex}-${unit.subIndex}-0-map-title`,
        parentIndex: unit.parentIndex,
        subIndex: unit.subIndex,
        sliceIndex: 0,
        variant: 'map-title',
        label: 'map-title',
        preview: previewFor(unit, 'map-title'),
      })
    }

    if (hasVizForeground) {
      if (!isHeroLike && leadLayers.length > 0 && visualLayers.length > 0) {
        // Split: stat card (sliceIndex 0) then chart card (sliceIndex 1). The
        // sliceIndex mirrors ShareShell's per-variant slice counter so the
        // ids line up with window.__shareCards__ at capture time.
        cards.push({
          id: `${unit.parentIndex}-${unit.subIndex}-0-graph`,
          parentIndex: unit.parentIndex,
          subIndex: unit.subIndex,
          sliceIndex: 0,
          variant: 'graph',
          graphScope: 'stat',
          label: 'stat',
          preview: `Stat · ${unit.heading || unit.parentConfig.heading || ''}`.trim(),
        })
        cards.push({
          id: `${unit.parentIndex}-${unit.subIndex}-1-graph`,
          parentIndex: unit.parentIndex,
          subIndex: unit.subIndex,
          sliceIndex: 1,
          variant: 'graph',
          graphScope: 'chart',
          label: 'graph',
          preview: previewFor(unit, 'graph'),
        })
      } else {
        cards.push({
          id: `${unit.parentIndex}-${unit.subIndex}-0-graph`,
          parentIndex: unit.parentIndex,
          subIndex: unit.subIndex,
          sliceIndex: 0,
          variant: 'graph',
          label: 'graph',
          preview: previewFor(unit, 'graph'),
        })
      }
    }

    const subOverride = shareOverride?.subsections?.[unit.subIndex]
    const paragraphsOverride =
      subOverride?.paragraphsOverride ?? shareOverride?.paragraphsOverride
    const shareParagraphs =
      subOverride?.shareParagraphs ?? shareOverride?.shareParagraphs
    const hasSplitOverride =
      (paragraphsOverride && paragraphsOverride.length > 0) ||
      (shareParagraphs && shareParagraphs.length > 0)

    if (kind !== 'text' && !hasSplitOverride) {
      cards.push({
        id: `${unit.parentIndex}-${unit.subIndex}-0-auto`,
        parentIndex: unit.parentIndex,
        subIndex: unit.subIndex,
        sliceIndex: 0,
        variant: 'auto',
        label: kind,
        preview: previewFor(unit, 'auto'),
      })
      continue
    }

    if (paragraphsOverride && paragraphsOverride.length > 0) {
      paragraphsOverride.forEach((entry, sliceIdx) => {
        const paras = normalizeOverrideEntry(entry)
        cards.push({
          id: `${unit.parentIndex}-${unit.subIndex}-${sliceIdx}-auto`,
          parentIndex: unit.parentIndex,
          subIndex: unit.subIndex,
          sliceIndex: sliceIdx,
          variant: 'auto',
          label: kind,
          preview: previewFor(unit, 'auto', paras[0]),
        })
      })
    } else if (shareParagraphs && shareParagraphs.length > 0) {
      shareParagraphs.forEach((spec, sliceIdx) => {
        const paras = sliceShareParagraphs(unit.paragraphs, spec)
        cards.push({
          id: `${unit.parentIndex}-${unit.subIndex}-${sliceIdx}-auto`,
          parentIndex: unit.parentIndex,
          subIndex: unit.subIndex,
          sliceIndex: sliceIdx,
          variant: 'auto',
          label: kind,
          preview: previewFor(unit, 'auto', paras[0]),
        })
      })
    } else if (unit.paragraphs.length === 0) {
      cards.push({
        id: `${unit.parentIndex}-${unit.subIndex}-0-auto`,
        parentIndex: unit.parentIndex,
        subIndex: unit.subIndex,
        sliceIndex: 0,
        variant: 'auto',
        label: kind,
        preview: previewFor(unit, 'auto'),
      })
    } else {
      unit.paragraphs.forEach((p, idx) => {
        cards.push({
          id: `${unit.parentIndex}-${unit.subIndex}-${idx}-auto`,
          parentIndex: unit.parentIndex,
          subIndex: unit.subIndex,
          sliceIndex: idx,
          variant: 'auto',
          label: kind,
          preview: previewFor(unit, 'auto', p),
        })
      })
    }
  }

  return cards
}
