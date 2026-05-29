import type { VizModule } from '@vismay/viz-engine'
import type {
  CameraAnimation,
  CameraEasing,
  CameraKeyframe,
  RocketModel,
  StarshipMaterial,
  StarshipMode,
} from '../../types'
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
 *       # Optional — scroll-scrubbed camera move over the same progress.
 *       # Position lerps in spherical space (angle delta → orbit, radius
 *       # delta → dolly); fov lerps for zoom; target pans the look-at point.
 *       camera:
 *         from: { position: [3.5, 1.4, 5], fov: 40, target: [0, 0, 0] }
 *         to:   { position: [-2.6, 0.9, 3.6], fov: 30, target: [0, -0.4, 0] }
 *         easing: easeInOut      # linear | easeIn | easeOut | easeInOut
 *         damping: 4             # higher = snappier glide between steps
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
  /**
   * Background painted on the wrapper div around the canvas. Omit to inherit
   * the layer's background (the common case — most stories want the section
   * bg to show through). `opacity` blends the color over whatever's behind.
   */
  stage?: {
    color?: string
    opacity?: number
  }
  /**
   * Soft ground disc under the ship. `show: false` hides it entirely;
   * omit the block to use the built-in defaults
   * (`#0a0d12` at `0.55`).
   */
  ground?: {
    show?: boolean
    color?: string
    opacity?: number
  }
  /**
   * Optional scroll-scrubbed camera move. When present (and `mode` is not
   * `inspect`, which owns the camera via OrbitControls), the camera animates
   * from `camera.from` to `camera.to` as the section's scrub `progress`
   * (`activeStep / scrubSteps`) goes 0 → 1. Note that in deck stories a
   * section only advances `activeStep` if it has `subsections`, so pair this
   * with subsections (or `scrubSteps`) for the move to actually scrub —
   * otherwise it pins a static custom framing.
   */
  camera?: CameraAnimation
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

const MODES: readonly StarshipMode[] = ['rotate', 'explode', 'bellyflop', 'inspect']
const MATERIALS: readonly StarshipMaterial[] = ['metal', 'black']
const MODELS = Object.keys(ROCKET_MODELS) as RocketModel[]
const EASINGS: readonly CameraEasing[] = ['linear', 'easeIn', 'easeOut', 'easeInOut']

function parseVec3(v: unknown, label: string): [number, number, number] {
  if (
    !Array.isArray(v) ||
    v.length !== 3 ||
    v.some((n) => typeof n !== 'number' || !Number.isFinite(n))
  ) {
    throw new Error(`${label} must be an array of three finite numbers (got ${JSON.stringify(v)})`)
  }
  return [v[0] as number, v[1] as number, v[2] as number]
}

function parseCameraKeyframe(raw: unknown, label: string): CameraKeyframe {
  if (!isObj(raw)) {
    throw new Error(`${label} must be an object (got ${typeof raw})`)
  }
  const position = parseVec3(raw.position, `${label}.position`)
  let fov = 40
  if (raw.fov != null) {
    if (typeof raw.fov !== 'number' || !Number.isFinite(raw.fov) || raw.fov <= 0 || raw.fov >= 180) {
      throw new Error(`${label}.fov must be a number in (0, 180) (got ${String(raw.fov)})`)
    }
    fov = raw.fov
  }
  const target = raw.target != null ? parseVec3(raw.target, `${label}.target`) : [0, 0, 0]
  return { position, fov, target: target as [number, number, number] }
}

function parseCamera(raw: unknown, label: string): CameraAnimation {
  if (!isObj(raw)) {
    throw new Error(`${label} must be an object (got ${typeof raw})`)
  }
  if (raw.from == null || raw.to == null) {
    throw new Error(`${label} requires both 'from' and 'to' keyframes`)
  }
  let easing: CameraEasing = 'easeInOut'
  if (raw.easing != null) {
    if (typeof raw.easing !== 'string' || !EASINGS.includes(raw.easing as CameraEasing)) {
      throw new Error(`${label}.easing must be one of ${EASINGS.join(', ')} (got ${String(raw.easing)})`)
    }
    easing = raw.easing as CameraEasing
  }
  let damping = 4
  if (raw.damping != null) {
    if (typeof raw.damping !== 'number' || !Number.isFinite(raw.damping) || raw.damping <= 0) {
      throw new Error(`${label}.damping must be a positive number (got ${String(raw.damping)})`)
    }
    damping = raw.damping
  }
  return {
    from: parseCameraKeyframe(raw.from, `${label}.from`),
    to: parseCameraKeyframe(raw.to, `${label}.to`),
    easing,
    damping,
  }
}

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
  let stage: StarshipViewerConfig['stage']
  if (raw.stage != null) {
    if (!isObj(raw.stage)) {
      throw new Error(
        `${ctx.label}: starship:viewer 'stage' must be an object (got ${typeof raw.stage})`,
      )
    }
    const { color, opacity } = raw.stage
    if (color != null && typeof color !== 'string') {
      throw new Error(
        `${ctx.label}: starship:viewer 'stage.color' must be a string (got ${typeof color})`,
      )
    }
    if (opacity != null) {
      if (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
        throw new Error(
          `${ctx.label}: starship:viewer 'stage.opacity' must be a number in [0,1] (got ${String(opacity)})`,
        )
      }
    }
    stage = {
      ...(color != null ? { color } : {}),
      ...(opacity != null ? { opacity } : {}),
    }
  }
  let ground: StarshipViewerConfig['ground']
  if (raw.ground != null) {
    if (!isObj(raw.ground)) {
      throw new Error(
        `${ctx.label}: starship:viewer 'ground' must be an object (got ${typeof raw.ground})`,
      )
    }
    const { show, color, opacity } = raw.ground
    if (show != null && typeof show !== 'boolean') {
      throw new Error(
        `${ctx.label}: starship:viewer 'ground.show' must be a boolean (got ${typeof show})`,
      )
    }
    if (color != null && typeof color !== 'string') {
      throw new Error(
        `${ctx.label}: starship:viewer 'ground.color' must be a string (got ${typeof color})`,
      )
    }
    if (opacity != null) {
      if (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
        throw new Error(
          `${ctx.label}: starship:viewer 'ground.opacity' must be a number in [0,1] (got ${String(opacity)})`,
        )
      }
    }
    ground = {
      ...(show != null ? { show } : {}),
      ...(color != null ? { color } : {}),
      ...(opacity != null ? { opacity } : {}),
    }
  }
  let camera: CameraAnimation | undefined
  if (raw.camera != null) {
    camera = parseCamera(raw.camera, `${ctx.label}: starship:viewer 'camera'`)
  }
  return {
    type: 'starship:viewer',
    model: model as RocketModel,
    mode: mode as StarshipMode,
    material: material as StarshipMaterial,
    ...(scrubSteps != null ? { scrubSteps } : {}),
    ...(stage != null ? { stage } : {}),
    ...(ground != null ? { ground } : {}),
    ...(camera != null ? { camera } : {}),
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
