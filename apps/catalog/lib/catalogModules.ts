import { sample as chartSample } from '@vismay/viz-engine/src/modules/chart/sample'
import { sample as mapSample } from '@vismay/viz-engine/src/modules/map/sample'
import { sample as imageSample } from '@vismay/viz-engine/src/modules/image/sample'
import { sample as embedSample } from '@vismay/viz-engine/src/modules/embed/sample'
import { sample as videoSample } from '@vismay/viz-engine/src/modules/video/sample'
import { sample as riveSample } from '@vismay/viz-engine/src/modules/rive/sample'
import { sample as raceRowSample } from '@vismay/f1-viz/modules/race-row/sample'
import { sample as raceCardSample } from '@vismay/f1-viz/modules/race-card/sample'
import { sample as driverStandingsSample } from '@vismay/f1-viz/modules/driver-standings/sample'
import { sample as positionChartSample } from '@vismay/f1-viz/modules/position-chart/sample'
import { sample as raceReplaySample } from '@vismay/f1-viz/modules/race-replay/sample'
import { sample as matchCardSample } from '@vismay/footshorts-viz/modules/match-card/sample'
import { sample as matchRowSample } from '@vismay/footshorts-viz/modules/match-row/sample'
import { sample as matchTileSample } from '@vismay/footshorts-viz/modules/match-tile/sample'
import { sample as standingsTableSample } from '@vismay/footshorts-viz/modules/standings-table/sample'
import { sample as standingsOverMatchdaysSample } from '@vismay/footshorts-viz/modules/standings-over-matchdays/sample'
import {
  sample as bracketSample,
  sampleTree as bracketSampleTree,
  sampleTreeVertical as bracketSampleTreeVertical,
} from '@vismay/footshorts-viz/modules/bracket/sample'
import { sample as tacticsBoardSample } from '@vismay/footshorts-viz/modules/tactics-board/sample'
import {
  sample as teamFormStripSample,
  sampleGrid as teamFormGridSample,
} from '@vismay/footshorts-viz/modules/team-form-strip/sample'
import { sample as starshipViewerSample } from '@vismay/starship-viz/modules/starship/sample'

export type CatalogCategory = 'Core' | 'F1' | 'Footshorts' | 'Starship'

export interface CatalogEntry {
  type: string
  category: CatalogCategory
  sample: unknown
  /**
   * Stable id for the card key + detail route. Defaults to `type`. Set it when
   * one module type needs more than one catalog card (e.g. a second sample that
   * exercises a different `layout`), so the cards don't collide on `type`.
   */
  id?: string
  /** Card/detail title override. Defaults to the module's `label`. */
  label?: string
  /**
   * Some modules can't render a working preview inside the catalog
   * (e.g. chart needs a runtime data endpoint the catalog doesn't serve).
   * When set, the card shows this notice instead of attempting to render.
   */
  previewNotice?: string
}

/** The routing/key identity for a catalog entry (falls back to its module type). */
export function catalogEntryId(entry: CatalogEntry): string {
  return entry.id ?? entry.type
}

export const catalogModules: CatalogEntry[] = [
  {
    type: 'chart',
    category: 'Core',
    sample: chartSample,
    previewNotice:
      'Chart preview is unavailable in the catalog — it loads runtime chart data per story.',
  },
  {
    type: 'map',
    category: 'Core',
    sample: mapSample,
    previewNotice:
      'Map preview requires a <StoryShellProvider> with a Mapbox token. See the schema + YAML on the detail page.',
  },
  { type: 'image', category: 'Core', sample: imageSample },
  { type: 'embed', category: 'Core', sample: embedSample },
  { type: 'video', category: 'Core', sample: videoSample },
  { type: 'rive', category: 'Core', sample: riveSample },
  { type: 'f1:race-row', category: 'F1', sample: raceRowSample },
  { type: 'f1:race-card', category: 'F1', sample: raceCardSample },
  { type: 'f1:driver-standings', category: 'F1', sample: driverStandingsSample },
  { type: 'f1:position-chart', category: 'F1', sample: positionChartSample },
  { type: 'f1:race-replay', category: 'F1', sample: raceReplaySample },
  { type: 'fs:match-card', category: 'Footshorts', sample: matchCardSample },
  { type: 'fs:match-row', category: 'Footshorts', sample: matchRowSample },
  { type: 'fs:match-tile', category: 'Footshorts', sample: matchTileSample },
  { type: 'fs:standings-table', category: 'Footshorts', sample: standingsTableSample },
  {
    type: 'fs:standings-over-matchdays',
    category: 'Footshorts',
    sample: standingsOverMatchdaysSample,
  },
  { type: 'fs:bracket', category: 'Footshorts', sample: bracketSample },
  {
    type: 'fs:bracket',
    id: 'fs:bracket@tree',
    label: 'Footshorts — bracket (tree)',
    category: 'Footshorts',
    sample: bracketSampleTree,
  },
  {
    type: 'fs:bracket',
    id: 'fs:bracket@tree-vertical',
    label: 'Footshorts — bracket (vertical)',
    category: 'Footshorts',
    sample: bracketSampleTreeVertical,
  },
  { type: 'fs:tactics-board', category: 'Footshorts', sample: tacticsBoardSample },
  { type: 'fs:team-form-strip', category: 'Footshorts', sample: teamFormStripSample },
  {
    type: 'fs:team-form-strip',
    id: 'fs:team-form-strip@grid',
    label: 'Footshorts — team form grid',
    category: 'Footshorts',
    sample: teamFormGridSample,
  },
  {
    type: 'starship:viewer',
    category: 'Starship',
    sample: starshipViewerSample,
    previewNotice:
      'Starship preview requires the merged GLB at /models/starship.glb. See the vizmaya-fyi demo route for a live render.',
  },
]

export function findCatalogEntry(id: string): CatalogEntry | undefined {
  return catalogModules.find((m) => catalogEntryId(m) === id)
}
