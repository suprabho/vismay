import type { MapView } from '@vismay/viz-engine'
import type { AspectRatio } from './AspectRatioToggle'
import type { VizmayaShareCardSnapshotV2 } from './layers/types'

export type { AspectRatio }
export type {
  CardComposition,
  BackgroundLayer,
  HeroLayer,
  ElementLayer,
  ElementKind,
  TextBlock,
  TextSlots,
  Transform,
  MapSpec,
  TemplateKind,
  VizmayaShareCardSnapshotV2,
} from './layers/types'

/** Per-card map data-layer visibility. Falsy suppresses that layer; omitted
 *  inherits the story's resolved layer set. */
export interface ShareLayerToggles {
  pins?: boolean
  regions?: boolean
  heatmap?: boolean
}

/** Per-card map appearance overrides. Each field falls back to the story's
 *  `defaults.*` when unset. */
export interface ShareAppearance {
  mapStyle?: string
  mapOpacity?: number
  pinColor?: string
  pinRadius?: number
}

/** Card "style" — maps onto ShareCard's variant + graphScope. */
export type CardVariant = 'auto' | 'map-title' | 'graph'
export type GraphScope = 'all' | 'stat' | 'chart'

/** Persisted base-type discriminator (also the `base_type` DB column). Derived
 *  for the saved-card list label only — never used for correctness. */
export type BaseType = 'map' | 'map-caption' | 'data'

/** A draggable thing placed on top of the card. Image overlays carry a `url`
 *  (data: URL for uploads/generated, or a remote http(s) URL proxied on
 *  render); emoji/text overlays carry `text`. Position is the overlay CENTER as
 *  a % of the card; `widthPct` is a % of the card width (for emoji it drives the
 *  font size). */
export interface Overlay {
  id: string
  kind: 'image' | 'emoji'
  url?: string
  text?: string
  label: string
  xPct: number
  yPct: number
  widthPct: number
}

/** Serializable snapshot of every composer control — enough to reconstruct a
 *  card. The selected unit is referenced by its (parentIndex, subIndex) so the
 *  story can be re-fetched and the unit re-resolved on load. */
export interface VizmayaShareCardSnapshot {
  version: 1
  storySlug: string | null
  ratio: AspectRatio
  variant: CardVariant
  graphScope: GraphScope
  parentIndex: number
  subIndex: number
  /** Caption overrides for the map-title / data heading + subheading. */
  headingOverride: string
  subheadingOverride: string
  overlays: Overlay[]
  /**
   * Per-ratio map camera edited via the map-edit overlay. Stored per ratio
   * because the framing (focus area + natural zoom) differs per aspect; each
   * entry maps onto `shareOverride.map.ratios[ratio]`. Optional for
   * back-compat with cards saved before map editing existed.
   */
  mapView?: Partial<Record<AspectRatio, MapView>>
  /** Per-card map data-layer toggles. */
  layers?: ShareLayerToggles
  /** Per-card map appearance overrides. */
  appearance?: ShareAppearance
  /** Map-title / hero dek line (supporting copy below the heading). */
  dek?: string
  /** Stat-card description body (overrides the joined paragraphs). */
  statDescription?: string
  /** Chart-card heading / subheading (Story-data variant). */
  chartHeading?: string
  chartSubheading?: string
  /** Raw body text (blank-line separated → paragraphs) replacing the section prose. */
  bodyText?: string
}

/** A persisted config is either the legacy v1 snapshot or the v2 composition.
 *  `migrateSnapshot` (layers/migrate.ts) normalizes any stored config to v2. */
export type AnyShareCardSnapshot = VizmayaShareCardSnapshot | VizmayaShareCardSnapshotV2

export interface SavedCard {
  id: string
  name: string
  storySlug: string | null
  baseType: string
  ratio: string | null
  config: AnyShareCardSnapshot
  imageUrl: string | null
  createdAt: string
  updatedAt: string
}
