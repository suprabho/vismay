/**
 * Starship vertical — 3D viz modules for SpaceX Starship storytelling.
 *
 * Engine boot calls this `register()` once when a story's frontmatter
 * declares `vertical: 'starship'`. Each concrete module is dynamic-imported
 * and handed to `registerVizModule` so vizmaya.fyi (and any app that doesn't
 * use Starship) tree-shakes the three.js + R3F bundle out of its main chunk.
 *
 * Phase 1 ships ONE module — `starship:viewer` — covering the four story
 * moments (rotate / explode / bellyflop / inspect) via a `mode` config field.
 * Splitting into per-mode modules is a TODO if authors want independent
 * stable identities per moment.
 */

import { registerVizModule } from '@vismay/viz-engine'

export async function register(): Promise<void> {
  const [{ default: viewerModule }] = await Promise.all([
    import('./modules/starship'),
  ])
  registerVizModule(viewerModule)
}
