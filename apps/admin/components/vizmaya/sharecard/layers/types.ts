import type { MapView, MapPinConfig, MapRegionLayer, HeatmapLayer, MapTextLabel } from '@vismay/viz-engine'
import type { AspectRatio } from '../AspectRatioToggle'

/**
 * Layer-composer data model. A card is a fixed set of named SLOTS, not a flat
 * stack: exactly one `background`, an optional `hero` graphic, many free
 * `elements`, structured `text`, and a `branding` footer. This encodes the
 * cardinality rules in the type system (you can't accidentally have two
 * backgrounds) and keeps the renderer's z-order implicit:
 *   background → hero → branding → heading/subheading → elements + annotations.
 *
 * Map data (pins / regions / heatmap / viz) is NOT stored here — it's resolved
 * from the story unit at render time. Slots carry only per-card OVERRIDES, so a
 * saved card re-resolves cleanly after a story edit.
 */

/** Transform for a freely-placed element / annotation. Position is the layer
 *  CENTER as a % of the card; `widthPct` is the box width as a % of card width
 *  (emoji/icon glyph size derives from it). All values are resolution-free. */
export interface Transform {
  xPct: number
  yPct: number
  widthPct: number
  scale: number
  rotation: number
  opacity: number
}

export const DEFAULT_TRANSFORM: Transform = {
  xPct: 50,
  yPct: 50,
  widthPct: 30,
  scale: 1,
  rotation: 0,
  opacity: 1,
}

/** Authored map content (parsed from the map-YAML editor). When present it
 *  takes precedence over the story unit's resolved map — this is what powers a
 *  from-scratch map and per-card data overrides. Mirrors a story `map:` block. */
export interface MapData {
  center?: [number, number]
  zoom?: number
  pitch?: number
  bearing?: number
  pins?: MapPinConfig[]
  regions?: MapRegionLayer
  heatmap?: HeatmapLayer
  textLabels?: MapTextLabel[]
}

/** Per-card map overrides shared by every map ROLE (background / hero / object).
 *  Camera is per-ratio because framing differs per aspect. Everything else
 *  falls through to the story's `defaults.*` when unset. */
export interface MapSpec {
  /** Per-ratio camera; each entry feeds the map render directly (no zoom-delta). */
  camera: Partial<Record<AspectRatio, MapView>>
  /** Data-layer visibility (false = hide on this card). */
  layers: { pins: boolean; regions: boolean; heatmap: boolean }
  appearance: {
    mapStyle?: string
    mapOpacity?: number
    pinColor?: string
    pinRadius?: number
  }
  /** Authored map content (pins/regions/heatmap/labels + camera defaults),
   *  edited as YAML. Overrides the story unit's resolved map when set. */
  data?: MapData
}

export function emptyMapSpec(): MapSpec {
  return { camera: {}, layers: { pins: true, regions: true, heatmap: true }, appearance: {} }
}

// ── Background (exactly one) ────────────────────────────────────────────────
export type ImageSource = 'asset' | 'upload' | 'generated'

/** Generation params kept so an AI image can be re-rolled / understood later. */
export interface ImageGenMeta {
  subject: string
  stylePrefix?: string
  /** Reference image used to condition the generation (data URL or remote). */
  referenceSrc?: string
}

export type BackgroundLayer =
  | { kind: 'none' }
  | ({ kind: 'map' } & MapSpec)
  | { kind: 'aura'; slug: string; posterSrc?: string; posterSource?: ImageSource }
  | {
      kind: 'image'
      src: string
      source: ImageSource
      objectFit: 'cover' | 'contain'
      gen?: ImageGenMeta
    }
  | { kind: 'solid'; color: string } // concrete hex
  | { kind: 'gradient'; gtype: 'linear' | 'radial'; from: string; to: string; angle?: number } // concrete hex stops

// ── Foreground hero graphic (0–1) ───────────────────────────────────────────
/** Placement box for the hero graphic, relative to the card. Lets the chart /
 *  map be sized + moved out from under the title (resizing width/height
 *  re-renders the chart crisply; scale is a CSS multiplier on top). Optional
 *  for back-compat — absent means fill the card. */
export interface HeroBox {
  xPct: number
  yPct: number
  widthPct: number
  heightPct: number
  scale: number
  rotation: number
  opacity: number
}

export const DEFAULT_HERO_BOX: HeroBox = {
  xPct: 50,
  yPct: 50,
  widthPct: 100,
  heightPct: 100,
  scale: 1,
  rotation: 0,
  opacity: 1,
}

export type HeroLayer =
  | {
      kind: 'chart'
      /** Chart id referenced by the section's foreground (resolveSlotsFlat). */
      chartId: string
      /** Per-card chart-data override (full chart-data JSON). Edited via Monaco. */
      dataOverride?: unknown
      heading?: string
      subheading?: string
      box?: HeroBox
    }
  | ({ kind: 'map'; box?: HeroBox } & MapSpec)

// ── Foreground elements (many) ──────────────────────────────────────────────
export type FontFamily = 'serif' | 'sans' | 'mono'

export interface ElementBase {
  id: string
  name: string
  visible: boolean
  locked: boolean
  transform: Transform
  /** Set on elements produced by a lossy v1→v2 migration so the UI can warn. */
  migratedFromV1?: boolean
}

export type ElementLayer = ElementBase &
  (
    | { kind: 'emoji'; glyph: string }
    | { kind: 'flag'; code: string; src: string; circle?: boolean; widthPx?: number; heightPx?: number }
    | { kind: 'icon'; name: string; weight: PhosphorWeight; color: string }
    | { kind: 'image'; src: string; source: ImageSource; objectFit: 'cover' | 'contain' }
    | ({ kind: 'map' } & MapSpec)
  )

export type PhosphorWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'

export type ElementKind = ElementLayer['kind']

// ── Text ────────────────────────────────────────────────────────────────────
export interface TextStyle {
  /** Concrete color (hex/rgb) OR a theme token like 'var(--color-text)'. */
  color: string
  fontFamily: FontFamily
  fontWeight: number
  /** Font size in px at RENDER_SIZE (scaled up by pixelRatio on capture). */
  fontSizePx: number
  align: 'left' | 'center' | 'right'
  lineHeight: number
}

/** Optional panel chrome behind a text block (annotation boxes etc.). Colors
 *  are concrete hex; the background is rendered as rgba(bg, bgOpacity). */
export interface TextPanel {
  enabled: boolean
  paddingPx: number
  radiusPx: number
  bg: string
  bgOpacity: number
  blurPx: number
  borderWidthPx: number
  borderColor: string
}

export const DEFAULT_TEXT_PANEL: TextPanel = {
  enabled: true,
  paddingPx: 12,
  radiusPx: 10,
  bg: '#ffffff',
  bgOpacity: 0.7,
  blurPx: 6,
  borderWidthPx: 0,
  borderColor: '#ffffff',
}

export interface TextBlock {
  id: string
  text: string
  visible: boolean
  transform: Transform
  style: TextStyle
  /** Optional background panel (padding / radius / bg+opacity / blur / border). */
  panel?: TextPanel
}

export interface TextSlots {
  heading?: TextBlock
  subheading?: TextBlock
  annotations: TextBlock[]
}

export interface BrandingSlot {
  visible: boolean
  transform?: Transform
}

// ── The whole card ──────────────────────────────────────────────────────────
export interface CardComposition {
  background: BackgroundLayer
  hero?: HeroLayer
  elements: ElementLayer[]
  text: TextSlots
  branding: BrandingSlot
}

/** Which template seeded the card — kept so we can relabel / re-seed. */
export type TemplateKind = 'map-caption' | 'data' | 'title-text'

/** v2 snapshot persisted in `vizmaya_share_cards.config` (opaque jsonb). */
export interface VizmayaShareCardSnapshotV2 {
  version: 2
  storySlug: string | null
  ratio: AspectRatio
  parentIndex: number
  subIndex: number
  templateKind: TemplateKind
  composition: CardComposition
}
