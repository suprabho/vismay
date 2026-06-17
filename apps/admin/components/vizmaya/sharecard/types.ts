import type { AspectRatio } from './AspectRatioToggle'

export type { AspectRatio }

/** Card "style" — maps onto ShareCard's variant + graphScope. */
export type CardVariant = 'auto' | 'map-title' | 'graph'
export type GraphScope = 'all' | 'stat' | 'chart'

/** Persisted base-type discriminator (also the `base_type` DB column). */
export type BaseType = 'map-caption' | 'data'

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
}

export interface SavedCard {
  id: string
  name: string
  storySlug: string | null
  baseType: string
  ratio: string | null
  config: VizmayaShareCardSnapshot
  imageUrl: string | null
  createdAt: string
  updatedAt: string
}
