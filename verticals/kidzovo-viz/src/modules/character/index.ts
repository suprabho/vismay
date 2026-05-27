import type { VizModule } from '@vismay/viz-engine'

import { listCharacters, resolveCharacter } from '../../data/characters'
import type { CharacterPoseConfig, KzCharacterConfig } from '../../types'

/**
 * `kz:character` — Rive-backed character with named poses, optional
 * per-step pose changes, opacity-gated `visibleFrom`, and 2D anchor on
 * the kz-storybook `stage` region.
 *
 * The actual rendering is delegated to the engine's existing rive module
 * (see `Component.tsx`). This file just owns the YAML schema, the
 * palette-driven defaults, and the parse-time validation.
 */

function parsePose(
  raw: unknown,
  palette: { poses: Record<string, number> },
  ctx: { label: string; who: string }
): CharacterPoseConfig | undefined {
  if (raw == null) return undefined
  if (typeof raw !== 'object') {
    throw new Error(`${ctx.label}: kz:character.pose must be an object`)
  }
  const p = raw as Record<string, unknown>
  const knownPoses = Object.keys(palette.poses).join(', ')

  if ('stepwise' in p) {
    if (!Array.isArray(p.stepwise)) {
      throw new Error(`${ctx.label}: kz:character.pose.stepwise must be an array`)
    }
    for (const v of p.stepwise) {
      if (v != null && typeof v !== 'string') {
        throw new Error(
          `${ctx.label}: kz:character.pose.stepwise entries must be strings or null`
        )
      }
      if (typeof v === 'string' && !(v in palette.poses)) {
        throw new Error(
          `${ctx.label}: pose '${v}' is not defined for character '${ctx.who}'. Available: ${knownPoses}`
        )
      }
    }
    return { stepwise: p.stepwise as (string | null)[] }
  }
  if ('static' in p) {
    if (typeof p.static !== 'string') {
      throw new Error(`${ctx.label}: kz:character.pose.static must be a string`)
    }
    if (!(p.static in palette.poses)) {
      throw new Error(
        `${ctx.label}: pose '${p.static}' is not defined for character '${ctx.who}'. Available: ${knownPoses}`
      )
    }
    return { static: p.static }
  }
  throw new Error(
    `${ctx.label}: kz:character.pose requires either 'stepwise' or 'static'`
  )
}

function parseConfig(
  raw: unknown,
  ctx: { slug: string; label: string }
): KzCharacterConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: kz:character layer must be an object`)
  }
  const r = raw as Record<string, unknown>

  if (typeof r.who !== 'string' || r.who.trim() === '') {
    throw new Error(`${ctx.label}: kz:character requires 'who' (e.g. 'ovi')`)
  }
  const palette = resolveCharacter(r.who)
  if (!palette) {
    throw new Error(
      `${ctx.label}: kz:character 'who' = '${r.who}' is not in the Kidzovo palette. Available: ${listCharacters().join(', ')}`
    )
  }

  return {
    type: 'kz:character',
    who: r.who,
    src: typeof r.src === 'string' ? r.src : undefined,
    artboard: typeof r.artboard === 'string' ? r.artboard : undefined,
    stateMachine: typeof r.stateMachine === 'string' ? r.stateMachine : undefined,
    pose: parsePose(r.pose, palette, { label: ctx.label, who: r.who }),
    visibleFrom: typeof r.visibleFrom === 'number' ? r.visibleFrom : undefined,
    anchor:
      r.anchor != null && typeof r.anchor === 'object'
        ? (r.anchor as KzCharacterConfig['anchor'])
        : undefined,
    bindings:
      r.bindings != null && typeof r.bindings === 'object'
        ? (r.bindings as KzCharacterConfig['bindings'])
        : undefined,
  }
}

const characterModule: VizModule<KzCharacterConfig> = {
  type: 'kz:character',
  label: 'Kidzovo character',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  stableIdentity: (config) =>
    `kz:character:${config.who}::${config.src ?? '(palette)'}::${config.artboard ?? ''}`,
  collectAssetKeys: (config) =>
    config.src?.startsWith('assets://') ? [config.src] : [],
  regionPreferences: ['stage'],
  // Defaults match the underlying rive module — characters never intercept
  // pointer events so scroll flows through to the snap container.
  defaultStyle: {
    pointerEvents: 'none',
  },
  adminForm: () => [
    {
      kind: 'select',
      key: 'who',
      label: 'Character',
      options: listCharacters().map((id) => ({ value: id, label: id })),
    },
    { kind: 'asset', key: 'src', label: 'Override .riv', accept: ['.riv'] },
    { kind: 'text', key: 'artboard', label: 'Artboard override' },
    { kind: 'text', key: 'stateMachine', label: 'State machine override' },
    { kind: 'json', key: 'pose', label: 'Pose ({static} or {stepwise: [...]})' },
    {
      kind: 'number',
      key: 'visibleFrom',
      label: 'Visible from step',
      min: 0,
      step: 1,
    },
    { kind: 'json', key: 'anchor', label: 'Anchor ({x, y})' },
    { kind: 'json', key: 'bindings', label: 'Rive view-model bindings' },
  ],
}

export default characterModule
