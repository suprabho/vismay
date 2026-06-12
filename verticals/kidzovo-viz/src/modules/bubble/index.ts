import type { VizModule } from '@vismay/viz-engine'

import type {
  BubblePosition,
  BubbleTailAt,
  BubbleTone,
  KzBubbleConfig,
} from '../../types'

/**
 * `kz:bubble` — a speech bubble with named tones, per-step text, and an
 * optional tail anchored at the speaker.
 *
 * Phase-3 implementation note: the plan (§5.2) calls for a .riv-backed
 * bubble with HTML text overlay. Until a real bubble.riv ships, the
 * Component renders the bubble in CSS — tone variants are CSS classes,
 * the tail is a CSS triangle, and pop-in/animation polish is deferred.
 * `src` is accepted on the config so authors can swap to .riv backing
 * later with no schema change.
 */

const VALID_TONES: readonly BubbleTone[] = [
  'gentle',
  'loud',
  'whisper',
  'thought',
]

const VALID_TAILS: readonly BubbleTailAt[] = [
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'top-left',
  'top-center',
  'top-right',
]

function parsePosition(raw: unknown, ctx: { label: string }): BubblePosition | undefined {
  if (raw == null) return undefined
  if (typeof raw !== 'object') {
    throw new Error(`${ctx.label}: kz:bubble.position must be an object`)
  }
  const p = raw as Record<string, unknown>
  if (typeof p.x !== 'string' || typeof p.y !== 'string') {
    throw new Error(
      `${ctx.label}: kz:bubble.position must have string 'x' and 'y' (CSS lengths)`
    )
  }
  return { x: p.x, y: p.y }
}

function parseConfig(
  raw: unknown,
  ctx: { slug: string; label: string }
): KzBubbleConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: kz:bubble layer must be an object`)
  }
  const r = raw as Record<string, unknown>

  if (!Array.isArray(r.textStepwise)) {
    throw new Error(`${ctx.label}: kz:bubble requires 'textStepwise' (array of strings or nulls)`)
  }
  for (const v of r.textStepwise) {
    if (v != null && typeof v !== 'string') {
      throw new Error(
        `${ctx.label}: kz:bubble.textStepwise entries must be strings or null`
      )
    }
  }

  const tone = (() => {
    if (r.tone == null) return undefined
    if (typeof r.tone !== 'string' || !VALID_TONES.includes(r.tone as BubbleTone)) {
      throw new Error(
        `${ctx.label}: kz:bubble.tone must be one of ${VALID_TONES.join(' | ')}`
      )
    }
    return r.tone as BubbleTone
  })()

  const tailAt = (() => {
    if (r.tailAt == null) return undefined
    if (
      typeof r.tailAt !== 'string' ||
      !VALID_TAILS.includes(r.tailAt as BubbleTailAt)
    ) {
      throw new Error(
        `${ctx.label}: kz:bubble.tailAt must be one of ${VALID_TAILS.join(' | ')}`
      )
    }
    return r.tailAt as BubbleTailAt
  })()

  const visibleOn = (() => {
    if (r.visibleOn == null) return undefined
    if (!Array.isArray(r.visibleOn) || !r.visibleOn.every((n) => typeof n === 'number')) {
      throw new Error(
        `${ctx.label}: kz:bubble.visibleOn must be an array of numbers (step indices)`
      )
    }
    return r.visibleOn as number[]
  })()

  return {
    type: 'kz:bubble',
    src: typeof r.src === 'string' ? r.src : undefined,
    visibleOn,
    speaker: typeof r.speaker === 'string' ? r.speaker : undefined,
    tone,
    textStepwise: r.textStepwise as (string | null)[],
    tailAt,
    position: parsePosition(r.position, { label: ctx.label }),
  }
}

const bubbleModule: VizModule<KzBubbleConfig> = {
  type: 'kz:bubble',
  label: 'Kidzovo bubble',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  // Identity collapses to the visible tone + position — distinct text per
  // step is handled inside the Component, not by remounting.
  stableIdentity: (config) =>
    `kz:bubble:${config.tone ?? 'gentle'}::${config.speaker ?? ''}::${
      config.position ? `${config.position.x},${config.position.y}` : 'auto'
    }`,
  collectAssetKeys: (config) =>
    config.src?.startsWith('assets://') ? [config.src] : [],
  regionPreferences: ['bubbles'],
  defaultStyle: {
    pointerEvents: 'none',
  },
  adminForm: () => [
    {
      kind: 'select',
      key: 'tone',
      label: 'Tone',
      options: VALID_TONES.map((t) => ({ value: t, label: t })),
    },
    {
      kind: 'select',
      key: 'tailAt',
      label: 'Tail direction',
      options: VALID_TAILS.map((t) => ({ value: t, label: t })),
    },
    { kind: 'text', key: 'speaker', label: 'Speaker (kz:character.who in the same section)' },
    { kind: 'json', key: 'textStepwise', label: 'Per-step text (array of strings or null)' },
    { kind: 'json', key: 'visibleOn', label: 'Visible-on steps (array of indices)' },
    { kind: 'json', key: 'position', label: 'Manual position ({x, y} as CSS lengths)' },
    { kind: 'asset', key: 'src', label: 'Override .riv (reserved — Component renders CSS today)', accept: ['.riv'] },
  ],
}

export default bubbleModule
