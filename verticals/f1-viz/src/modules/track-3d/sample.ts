import type { Track3DConfig } from './index'
import { sampleFixture } from '../race-replay/sampleFixture'

/**
 * Catalog/SSG sample — reuses the race-replay demo fixture (5 cars · 2 laps).
 * The fixture has no elevation `z`, so the catalog renders the track flat
 * (the "3D · flat" badge appears); real ingested sessions carry elevation.
 */
export const sample: Track3DConfig = {
  type: 'f1:track-3d',
  title: 'Vismay Demo GP — 3D track',
  fixture: sampleFixture,
  chaseCam: false,
  autoPlay: true,
}
