import type { AnyShareCardSnapshot, BaseType, VizmayaShareCardSnapshot } from '../types'
import type {
  CardComposition,
  ElementLayer,
  HeroBox,
  HeroLayer,
  MapSpec,
  TemplateKind,
  TextBlock,
  Transform,
} from './types'
import { DEFAULT_HERO_BOX, DEFAULT_TRANSFORM } from './types'
import { normalizeGroupContiguity } from '../composer/mutations'

/**
 * v1 → v2 migration. v1 stored a `variant` + caption/map/overlay overrides; v2
 * stores a full named-slot `composition`. Because reconstructing the chart hero
 * needs the resolved unit (for the chartId), migration is split:
 *   - `snapshotVersion` / `templateKindFromV1` are pure and need only the raw snapshot;
 *   - `applyV1Overrides(seed, v1)` patches a freshly seeded composition (from
 *     `seedTemplate`, which has the unit) with the v1 overrides.
 * `loadCard` seeds from the template once the unit resolves, then patches.
 *
 * The migration is intentionally lossy and flags what it can't reproduce:
 *   - `graphScope` ('all' | 'stat') has no slot equivalent — only 'chart' maps
 *     cleanly; the seeded chart hero is kept regardless.
 *   - v1 overlays conflate emoji / flag / upload / remote image into one untyped
 *     shape; we URL-sniff (flagcdn → flag, data: → upload, else image) and tag
 *     the result `migratedFromV1` so the UI can note it.
 */

export function snapshotVersion(raw: AnyShareCardSnapshot | null | undefined): 1 | 2 {
  if (raw && typeof raw === 'object' && (raw as { version?: number }).version === 2) return 2
  return 1
}

export function templateKindFromV1(v1: VizmayaShareCardSnapshot): TemplateKind {
  if (v1.variant === 'map-title') return 'map-caption'
  if (v1.variant === 'graph') return 'data'
  return 'title-text'
}

/** Find the card's map slot (background or hero) and patch it in place-ish. */
function patchMapSpec(spec: MapSpec, v1: VizmayaShareCardSnapshot): MapSpec {
  return {
    camera: v1.mapView ?? spec.camera,
    layers: {
      pins: v1.layers?.pins !== false,
      regions: v1.layers?.regions !== false,
      heatmap: v1.layers?.heatmap !== false,
    },
    appearance: {
      mapStyle: v1.appearance?.mapStyle ?? spec.appearance.mapStyle,
      mapOpacity: v1.appearance?.mapOpacity ?? spec.appearance.mapOpacity,
      pinColor: v1.appearance?.pinColor ?? spec.appearance.pinColor,
      pinRadius: v1.appearance?.pinRadius ?? spec.appearance.pinRadius,
    },
  }
}

const FLAGCDN_RE = /flagcdn\.com\/w\d+\/([a-z-]+)\.png/i

function overlayToElement(
  o: NonNullable<VizmayaShareCardSnapshot['overlays']>[number],
  i: number,
): ElementLayer {
  const transform: Transform = {
    ...DEFAULT_TRANSFORM,
    xPct: o.xPct,
    yPct: o.yPct,
    widthPct: o.widthPct,
  }
  const base = {
    id: `mig-${i}`,
    name: o.label || o.kind,
    visible: true,
    locked: false,
    transform,
    migratedFromV1: true as const,
  }
  if (o.kind === 'emoji') {
    return { ...base, kind: 'emoji', glyph: o.text ?? '⭐' }
  }
  const url = o.url ?? ''
  const flag = FLAGCDN_RE.exec(url)
  if (flag) {
    return { ...base, kind: 'flag', code: flag[1].toLowerCase(), src: url }
  }
  return {
    ...base,
    kind: 'image',
    src: url,
    source: url.startsWith('data:') ? 'upload' : 'asset',
    objectFit: 'contain',
  }
}

function migratedTextBlock(id: string, text: string, after?: TextBlock): TextBlock {
  // Place migrated extra copy a little below the heading by default.
  const transform: Transform = {
    ...DEFAULT_TRANSFORM,
    xPct: after?.transform.xPct ?? 50,
    yPct: Math.min(95, (after?.transform.yPct ?? 30) + 14),
    widthPct: after?.transform.widthPct ?? 70,
  }
  return {
    id,
    text,
    visible: true,
    transform,
    style: {
      color: 'var(--color-muted)',
      fontFamily: 'sans',
      fontWeight: 400,
      fontSizePx: 14,
      align: after?.style.align ?? 'left',
      lineHeight: 1.4,
    },
  }
}

/**
 * Patch a freshly-seeded composition with the v1 snapshot's overrides. The seed
 * (from `seedTemplate`) provides the structural slots (incl. the map slot and
 * the chart hero's chartId); this only overlays the user's saved edits.
 */
export function applyV1Overrides(
  seed: CardComposition,
  v1: VizmayaShareCardSnapshot,
): CardComposition {
  const next: CardComposition = {
    ...seed,
    text: {
      heading: seed.text.heading ? { ...seed.text.heading } : undefined,
      subheading: seed.text.subheading ? { ...seed.text.subheading } : undefined,
      annotations: [...seed.text.annotations],
    },
    elements: [...seed.elements],
  }

  // Caption text.
  if (v1.headingOverride?.trim() && next.text.heading) {
    next.text.heading.text = v1.headingOverride.trim()
  }
  if (v1.subheadingOverride?.trim() && next.text.subheading) {
    next.text.subheading.text = v1.subheadingOverride.trim()
  }

  // Dek / body / stat description → annotations (the v2 model has no dedicated
  // dek slot; carry them as annotation text so nothing is silently dropped).
  const extras = [v1.dek, v1.statDescription, v1.bodyText].map((t) => t?.trim()).filter(Boolean) as string[]
  extras.forEach((text, i) => {
    next.text.annotations.push(migratedTextBlock(`mig-text-${i}`, text, next.text.heading))
  })

  // Graphic-element overrides (the seed places the chart / map as an element).
  const bgIsMap = next.background.kind === 'map'
  next.elements = next.elements.map((e) => {
    if (e.kind === 'chart') {
      return {
        ...e,
        heading: v1.chartHeading?.trim() || e.heading,
        subheading: v1.chartSubheading?.trim() || e.subheading,
      }
    }
    // Map overrides land on the background map if present, else the map element.
    if (e.kind === 'map' && !bgIsMap) return { ...e, ...patchMapSpec(e, v1) }
    return e
  })
  if (bgIsMap && next.background.kind === 'map') {
    next.background = { kind: 'map', ...patchMapSpec(next.background, v1) }
  }

  // Overlays → elements.
  if (v1.overlays?.length) {
    next.elements.push(...v1.overlays.map(overlayToElement))
  }

  return next
}

// ── legacy hero → graphic element ────────────────────────────────────────────
let heroSeq = 0
function boxToTransform(box: HeroBox): Transform {
  return {
    xPct: box.xPct,
    yPct: box.yPct,
    widthPct: box.widthPct,
    heightPct: box.heightPct,
    scale: box.scale,
    rotation: box.rotation,
    opacity: box.opacity,
  }
}

/** Convert a legacy single-slot hero (chart / map) into a graphic element so it
 *  joins the unified, reorderable `elements` list. The hero's box maps onto the
 *  element transform's width×height. */
export function heroToElement(hero: HeroLayer): ElementLayer {
  const transform = boxToTransform(hero.box ?? DEFAULT_HERO_BOX)
  const base = { id: `hero-${heroSeq++}`, visible: true, locked: false, transform }
  if (hero.kind === 'chart') {
    return {
      ...base,
      kind: 'chart',
      name: 'Chart',
      chartId: hero.chartId,
      dataOverride: hero.dataOverride,
      heading: hero.heading,
      subheading: hero.subheading,
    }
  }
  // Map hero: carry the MapSpec fields across (the box already became transform).
  return {
    ...base,
    kind: 'map',
    name: 'Map',
    camera: hero.camera,
    layers: hero.layers,
    appearance: hero.appearance,
    data: hero.data,
  }
}

/** Fold a legacy `hero` slot into `elements`, leaving newer compositions (no
 *  hero) untouched. Run on every loaded snapshot so the renderer / composer only
 *  ever see graphics as elements. Prepended so the converted hero sits at the
 *  bottom of the element stack — closest to its old beneath-everything role. */
export function normalizeComposition(c: CardComposition): CardComposition {
  const folded = c.hero ? { ...c, hero: undefined, elements: [heroToElement(c.hero), ...c.elements] } : c
  // Keep group members contiguous so the composer renders one header per group.
  return normalizeGroupContiguity(folded)
}

/** Derived list-label discriminator. Recomputable; never used for correctness. */
export function composeBaseType(composition: CardComposition): BaseType {
  if (composition.background.kind === 'map') return 'map'
  if (composition.elements.some((e) => e.kind === 'chart')) return 'data'
  if (composition.elements.some((e) => e.kind === 'map') || composition.background.kind === 'aura') {
    return 'map-caption'
  }
  return 'data'
}
