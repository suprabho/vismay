'use client'

import type { CSSProperties } from 'react'

import type { VizRenderProps } from '@vismay/viz-engine'
import RiveLayerComponent from '@vismay/viz-engine/src/modules/rive/Component'
import type { RiveLayerConfig } from '@vismay/viz-engine/src/modules/rive'

import { resolveCharacter } from '../../data/characters'
import type { CharacterAnchor, KzCharacterConfig } from '../../types'

/**
 * `kz:character` Component — thin wrapper around the engine's rive
 * Component that adds:
 *
 *   1. Palette lookup. Resolves `who` against `data/characters.ts` so YAML
 *      stays as concise as `who: ovi`.
 *   2. Pose binding. Translates `pose.stepwise: ['standing', 'throwing']`
 *      into the rive module's `stepInput` shape with numeric `values`
 *      drawn from the palette's `poses` map. Nulls carry the prior pose.
 *   3. `visibleFrom`. Drives a CSS opacity fade on the wrapper — outside
 *      the .riv so authors don't have to bake step-gating into every file.
 *   4. Anchor positioning. Translates the friendly `{x, y}` anchor into an
 *      absolute-positioned wrapper, defaulting to bottom-center (the
 *      natural "character standing on the floor" placement).
 */

/* ─── Anchor → CSS positioning ─────────────────────────────────── */

const NAMED_X: Record<'left' | 'center' | 'right', number> = {
  left: 0.1,
  center: 0.5,
  right: 0.9,
}

function clamp01(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function anchorToStyle(anchor: CharacterAnchor | undefined): CSSProperties {
  const x = anchor?.x ?? 'center'
  const y = anchor?.y ?? 'bottom'
  const xFraction = clamp01(typeof x === 'number' ? x : NAMED_X[x])
  const left = `${xFraction * 100}%`

  // y === 'bottom' anchors the character's bottom EDGE to the stage floor
  // (the natural read for "standing"). All other y values anchor the
  // character's CENTER vertically.
  if (y === 'bottom') {
    return { position: 'absolute', left, bottom: 0, transform: 'translateX(-50%)' }
  }
  if (y === 'top') {
    return { position: 'absolute', left, top: 0, transform: 'translateX(-50%)' }
  }
  if (y === 'center') {
    return {
      position: 'absolute',
      left,
      top: '50%',
      transform: 'translate(-50%, -50%)',
    }
  }
  const yFraction = clamp01(y)
  return {
    position: 'absolute',
    left,
    top: `${yFraction * 100}%`,
    transform: 'translate(-50%, -50%)',
  }
}

/* ─── Character bounding box ───────────────────────────────────── */

// The Rive layer fills its parent — we have to give the wrapper an explicit
// size or the character collapses to 0×0. Default: ~60vh tall, capped at
// 80vw so portrait viewports don't blow the character past the screen edge.
// Tuned to leave the caption band breathing room above and keep the
// silhouette readable across landscape + portrait.
const CHARACTER_SIZE: CSSProperties = {
  width: 'min(40vh, 80vw)',
  height: '60vh',
}

/* ─── pose.stepwise → rive stepInput ───────────────────────────── */

function buildStepInput(
  config: KzCharacterConfig,
  palette: { poseInputName: string; poses: Record<string, number> }
): RiveLayerConfig['stepInput'] {
  if (!config.pose) return undefined

  if ('static' in config.pose) {
    const value = palette.poses[config.pose.static] ?? 0
    // Static pose: a single-element stepwise array. The rive Component
    // clamps activeStep into the array, so all steps see this value.
    return {
      name: palette.poseInputName,
      type: 'number',
      map: 'stepwise',
      values: [value],
    }
  }

  // Stepwise: map each named pose → number. Nulls carry the prior pose
  // forward so authors only have to write changes.
  let last = 0
  const values: number[] = config.pose.stepwise.map((name) => {
    if (name == null) return last
    last = palette.poses[name] ?? last
    return last
  })
  return {
    name: palette.poseInputName,
    type: 'number',
    map: 'stepwise',
    values,
  }
}

/* ─── Component ────────────────────────────────────────────────── */

export default function KzCharacterComponent(
  props: VizRenderProps<KzCharacterConfig>
) {
  const { config, activeStep } = props
  const palette = resolveCharacter(config.who)
  // parseConfig already validated `who`, but guard against live YAML edits
  // mid-render or a hot-reload race.
  if (!palette) {
    return null
  }

  const stepInput = buildStepInput(config, palette)

  const mergedBindings =
    palette.defaultBindings || config.bindings
      ? { ...(palette.defaultBindings ?? {}), ...(config.bindings ?? {}) }
      : undefined

  // Always send the merged costume (palette baseline + per-layer overrides)
  // so panels without an explicit `costume` reset to defaults instead of
  // inheriting whatever a previous panel last wrote. The rive instance is
  // shared across panels via stableIdentity, so unset inputs stay sticky
  // unless we re-write them every render.
  const mergedCostume =
    palette.defaultCostume || config.costume
      ? { ...(palette.defaultCostume ?? {}), ...(config.costume ?? {}) }
      : undefined

  const riveConfig: RiveLayerConfig = {
    type: 'rive',
    src: config.src ?? palette.src,
    artboard: config.artboard ?? palette.artboard,
    stateMachine: config.stateMachine ?? palette.stateMachine,
    autoplay: true,
    layout: { fit: 'contain', alignment: 'bottomCenter' },
    stepInput,
    staticInputs: mergedCostume,
    viewModel: mergedBindings ? { bindings: mergedBindings } : undefined,
  }

  const isVisible = config.visibleFrom == null || activeStep >= config.visibleFrom

  return (
    <div
      style={{
        ...anchorToStyle(config.anchor),
        ...CHARACTER_SIZE,
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.4s ease-out',
        // Mirrors the rive module's defaultStyle — characters never
        // intercept scroll/wheel events.
        pointerEvents: 'none',
      }}
    >
      <RiveLayerComponent {...props} config={riveConfig} />
    </div>
  )
}
