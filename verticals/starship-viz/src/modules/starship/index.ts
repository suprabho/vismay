import type { VizModule } from '@vismay/viz-engine'
import type { StarshipMaterial, StarshipMode } from '../../types'

/**
 * `starship:viewer` — Foreground viz module wrapping a Three.js / R3F scene
 * of SpaceX Starship.
 *
 * One module covers all four story moments — rotate / explode / bellyflop /
 * inspect — via the `mode` config field, because they share a single GLB,
 * material setup, and scene graph. Splitting would force multiple GLB loads
 * for a single story page.
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: starship:viewer
 *       mode: explode            # rotate | explode | bellyflop | inspect
 *       material: metal          # metal | black
 *       # Optional — drives explode/bellyflop scrub. Defaults to using
 *       # `activeStep` mapped to 0..1 via `scrubSteps`.
 *       scrubSteps: 3
 */

export interface StarshipViewerConfig {
  type: 'starship:viewer'
  mode: StarshipMode
  material: StarshipMaterial
  /**
   * Number of scroll steps the scrub maps over. `activeStep` of 0 → 0.0,
   * `scrubSteps` (or more) → 1.0. Defaults to 1 (single step, all-or-nothing).
   * Only meaningful for `mode: 'explode' | 'bellyflop'`.
   */
  scrubSteps?: number
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

const MODES: readonly StarshipMode[] = ['rotate', 'explode', 'bellyflop', 'inspect']
const MATERIALS: readonly StarshipMaterial[] = ['metal', 'black']

function parseConfig(
  raw: unknown,
  ctx: { slug: string; label: string },
): StarshipViewerConfig {
  if (!isObj(raw)) {
    throw new Error(`${ctx.label}: starship:viewer layer must be an object`)
  }
  const mode = raw.mode
  if (typeof mode !== 'string' || !MODES.includes(mode as StarshipMode)) {
    throw new Error(
      `${ctx.label}: starship:viewer 'mode' must be one of ${MODES.join(', ')} (got ${String(mode)})`,
    )
  }
  const material = raw.material ?? 'metal'
  if (typeof material !== 'string' || !MATERIALS.includes(material as StarshipMaterial)) {
    throw new Error(
      `${ctx.label}: starship:viewer 'material' must be one of ${MATERIALS.join(', ')} (got ${String(material)})`,
    )
  }
  const scrubStepsRaw = raw.scrubSteps
  let scrubSteps: number | undefined
  if (scrubStepsRaw != null) {
    if (typeof scrubStepsRaw !== 'number' || !Number.isFinite(scrubStepsRaw) || scrubStepsRaw <= 0) {
      throw new Error(
        `${ctx.label}: starship:viewer 'scrubSteps' must be a positive number (got ${String(scrubStepsRaw)})`,
      )
    }
    scrubSteps = scrubStepsRaw
  }
  return {
    type: 'starship:viewer',
    mode: mode as StarshipMode,
    material: material as StarshipMaterial,
    ...(scrubSteps != null ? { scrubSteps } : {}),
  }
}

const starshipViewerModule: VizModule<StarshipViewerConfig> = {
  type: 'starship:viewer',
  label: 'Starship — 3D viewer',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  // `first-paint` rather than `instant` because the GLB fetch + decode +
  // initial frame can take several hundred ms on a cold cache. Capture
  // shouldn't snapshot before the model is visible.
  readinessProfile: 'first-paint',
  // Identity keyed only by mode/material so authors who keep the same ship
  // visible across consecutive units don't pay for a remount + re-fetch.
  stableIdentity: (config) => `starship:viewer:${config.mode}:${config.material}`,
}

export default starshipViewerModule
