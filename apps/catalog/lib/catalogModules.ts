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
import { sample as constructorStandingsSample } from '@vismay/f1-viz/modules/constructor-standings/sample'
import { sample as qualifyingResultsSample } from '@vismay/f1-viz/modules/qualifying-results/sample'
import { sample as telemetryClipSample } from '@vismay/f1-viz/modules/telemetry-clip/sample'
import { sample as track3dSample } from '@vismay/f1-viz/modules/track-3d/sample'
import { sample as telemetryChartSample } from '@vismay/f1-viz/modules/telemetry-chart/sample'
import {
  sample as matchCardSample,
  sampleGrid as matchCardGridSample,
} from '@vismay/footshorts-viz/modules/match-card/sample'
import {
  sample as matchRowSample,
  sampleStack as matchRowStackSample,
} from '@vismay/footshorts-viz/modules/match-row/sample'
import {
  sample as matchTileSample,
  sampleGrid as matchTileGridSample,
} from '@vismay/footshorts-viz/modules/match-tile/sample'
import { sample as matchTimelineSample } from '@vismay/footshorts-viz/modules/match-timeline/sample'
import { sample as standingsTableSample } from '@vismay/footshorts-viz/modules/standings-table/sample'
import { sample as standingsOverMatchdaysSample } from '@vismay/footshorts-viz/modules/standings-over-matchdays/sample'
import {
  sample as bracketSample,
  sampleTree as bracketSampleTree,
  sampleTreeVertical as bracketSampleTreeVertical,
  sampleIncomplete as bracketSampleIncomplete,
  sampleIncompleteVertical as bracketSampleIncompleteVertical,
} from '@vismay/footshorts-viz/modules/bracket/sample'
import { sample as tacticsBoardSample } from '@vismay/footshorts-viz/modules/tactics-board/sample'
import {
  sample as teamFormStripSample,
  sampleGrid as teamFormGridSample,
} from '@vismay/footshorts-viz/modules/team-form-strip/sample'
import { sample as starshipViewerSample } from '@vismay/starship-viz/modules/starship/sample'
import { sample as kzCharacterSample } from '@vismay/kidzovo-viz/modules/character/sample'
import { sample as kzBubbleSample } from '@vismay/kidzovo-viz/modules/bubble/sample'

export type CatalogCategory = 'Core' | 'F1' | 'Footshorts' | 'Starship' | 'Kidzovo'

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
   * When set, both the card and the detail page show this notice instead of
   * attempting to render.
   */
  previewNotice?: string
  /**
   * For modules that render fine on the detail page but shouldn't auto-mount in
   * the grid (e.g. an expensive WebGL scene best viewed full-size). The compact
   * card shows this notice; the detail page mounts the live component.
   */
  cardNotice?: string
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
  { type: 'f1:constructor-standings', category: 'F1', sample: constructorStandingsSample },
  { type: 'f1:qualifying-results', category: 'F1', sample: qualifyingResultsSample },
  { type: 'f1:telemetry-clip', category: 'F1', sample: telemetryClipSample },
  {
    type: 'f1:track-3d',
    category: 'F1',
    sample: track3dSample,
    cardNotice: 'WebGL 3D track — open to orbit; renders flat without elevation data.',
  },
  { type: 'f1:telemetry-chart', category: 'F1', sample: telemetryChartSample },
  { type: 'fs:match-card', category: 'Footshorts', sample: matchCardSample },
  {
    type: 'fs:match-card',
    id: 'fs:match-card@grid',
    label: 'Footshorts — match card (grid)',
    category: 'Footshorts',
    sample: matchCardGridSample,
  },
  { type: 'fs:match-row', category: 'Footshorts', sample: matchRowSample },
  {
    type: 'fs:match-row',
    id: 'fs:match-row@stack',
    label: 'Footshorts — match row (stack)',
    category: 'Footshorts',
    sample: matchRowStackSample,
  },
  { type: 'fs:match-tile', category: 'Footshorts', sample: matchTileSample },
  {
    type: 'fs:match-tile',
    id: 'fs:match-tile@grid',
    label: 'Footshorts — match tile (grid)',
    category: 'Footshorts',
    sample: matchTileGridSample,
  },
  { type: 'fs:match-timeline', category: 'Footshorts', sample: matchTimelineSample },
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
  {
    type: 'fs:bracket',
    id: 'fs:bracket@incomplete',
    label: 'Footshorts — bracket (incomplete draw)',
    category: 'Footshorts',
    sample: bracketSampleIncomplete,
  },
  {
    type: 'fs:bracket',
    id: 'fs:bracket@incomplete-vertical',
    label: 'Footshorts — bracket (incomplete, vertical)',
    category: 'Footshorts',
    sample: bracketSampleIncompleteVertical,
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
  {
    type: 'kz:character',
    category: 'Kidzovo',
    sample: kzCharacterSample,
    previewNotice:
      'Character preview requires the owl .riv at /kidzovo-demo/owl.riv, served by the kidzovo host app. See apps/kidzovo/web for a live render.',
  },
  { type: 'kz:bubble', category: 'Kidzovo', sample: kzBubbleSample },
]

export function findCatalogEntry(id: string): CatalogEntry | undefined {
  return catalogModules.find((m) => catalogEntryId(m) === id)
}
