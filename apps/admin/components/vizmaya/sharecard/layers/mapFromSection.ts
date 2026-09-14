import { resolveSlotsFlat } from '@vismay/viz-engine'
import type {
  HeatmapLayer,
  MapPinConfig,
  MapRegionLayer,
  MapTextLabel,
  ResolvedUnit,
  StorySectionConfig,
  VizLayer,
} from '@vismay/viz-engine'
import type { MapData } from './types'

/** Shape of a `type: 'map'` background layer from `resolveSlotsFlat`. */
interface ResolvedMapLayer {
  type: 'map'
  center?: [number, number]
  zoom?: number
  pitch?: number
  bearing?: number
  pins?: MapPinConfig[]
  regions?: MapRegionLayer
  heatmap?: HeatmapLayer
  textLabels?: MapTextLabel[]
}

function resolvedMapLayer(section: StorySectionConfig): (VizLayer & ResolvedMapLayer) | undefined {
  return resolveSlotsFlat(section).background.find(
    (l): l is VizLayer & ResolvedMapLayer => l.type === 'map' && Array.isArray((l as { center?: unknown }).center),
  )
}

/**
 * Build authored map content (`MapSpec.data`) from a story unit — the same
 * data the story renders at that step. Mirrors the runtime's subsection
 * semantics: the unit's own `subsections[subIndex].map` override REPLACES the
 * corresponding parent fields (pins / regions / heatmap / labels / camera),
 * so importing "step 3" gives exactly what step 3 shows, not a union.
 * Returns null when the section carries no map.
 */
export function mapDataFromUnit(unit: ResolvedUnit): MapData | null {
  const base = resolvedMapLayer(unit.parentConfig)
  if (!base?.center) return null
  const sub = unit.parentConfig.subsections?.[unit.subIndex]?.map
  const data: MapData = {
    center: sub?.center ?? base.center,
    zoom: sub?.zoom ?? base.zoom,
    pitch: sub?.pitch ?? base.pitch,
    bearing: sub?.bearing ?? base.bearing,
    pins: sub?.pins ?? base.pins,
    regions: sub?.regions ?? base.regions,
    heatmap: sub?.heatmap ?? base.heatmap,
    textLabels: sub?.textLabels ?? base.textLabels,
  }
  // Drop undefined keys so the YAML editor shows a clean block.
  for (const k of Object.keys(data) as Array<keyof MapData>) {
    if (data[k] === undefined) delete data[k]
  }
  return data
}

export function unitHasMap(unit: ResolvedUnit): boolean {
  return resolvedMapLayer(unit.parentConfig) !== undefined
}

/** Section dropdown label — matches the composer's Setup → Section picker. */
export function unitLabel(unit: ResolvedUnit): string {
  const head = unit.heading?.trim().slice(0, 50) || `Section ${unit.parentIndex + 1}`
  return unit.subIndex > 0 ? `${head} · step ${unit.subIndex}` : head
}

/** Short summary of what a map import carries, for the picker's hint line. */
export function mapDataSummary(data: MapData): string {
  const parts: string[] = []
  if (data.pins?.length) parts.push(`${data.pins.length} pin${data.pins.length === 1 ? '' : 's'}`)
  if (data.regions) parts.push('regions')
  if (data.heatmap) parts.push('heatmap')
  if (data.textLabels?.length) parts.push(`${data.textLabels.length} label${data.textLabels.length === 1 ? '' : 's'}`)
  return parts.length ? parts.join(' · ') : 'camera only'
}
