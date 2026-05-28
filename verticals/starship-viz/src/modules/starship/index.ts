import type { VizModule } from '@vismay/viz-engine'
import type { RocketModel, StarshipMaterial, StarshipMode } from '../../types'
import { ROCKET_MODELS } from '../../types'

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
  /** Which rocket to render. Defaults to `'starship'`. */
  model: RocketModel
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
const MODELS = Object.keys(ROCKET_MODELS) as RocketModel[]

function parseConfig(
  raw: unknown,
  ctx: { slug: string; label: string },
): StarshipViewerConfig {
  if (!isObj(raw)) {
    throw new Error(`${ctx.label}: starship:viewer layer must be an object`)
  }
  const model = raw.model ?? 'starship'
  if (typeof model !== 'string' || !MODELS.includes(model as RocketModel)) {
    throw new Error(
      `${ctx.label}: starship:viewer 'model' must be one of ${MODELS.join(', ')} (got ${String(model)})`,
    )
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
    model: model as RocketModel,
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
  // Identity keyed on model/mode/material so consecutive units showing the
  // same rocket reuse the WebGL context instead of remounting.
  stableIdentity: (config) =>
    `starship:viewer:${config.model}:${config.mode}:${config.material}`,
}

export default starshipViewerModule
