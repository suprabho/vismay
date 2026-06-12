'use client'

import { useEffect } from 'react'
import type { CSSProperties } from 'react'

import type { VizRenderProps } from '@vismay/viz-engine'
import { useForegroundContent } from '@vismay/viz-engine'

import type {
  BubbleTailAt,
  BubbleTone,
  CharacterAnchor,
  KzBubbleConfig,
} from '../../types'

/**
 * `kz:bubble` Component — CSS-rendered speech bubble.
 *
 *   1. Text overlay. `textStepwise[activeStep]` is rendered as plain HTML
 *      so wrap/length behave correctly and copy edits don't redeploy.
 *   2. Tone variants. `gentle` / `loud` / `whisper` / `thought` map to
 *      distinct CSS chrome (color, border, weight, italic, cloud-radii).
 *   3. Speaker → tail. When `speaker: 'ovi'` is set, the Component walks
 *      the section's stage region looking for a matching `kz:character`
 *      and derives `tailAt` from its anchor.x — bubble in the upper third
 *      means the tail points DOWN at the speaker.
 *   4. Position. Defaults to the upper-center bubble slot; authors
 *      override via `position: { x, y }` (any CSS length).
 *
 * The plan (§5.2) calls for a .riv-backed bubble (pop-in animation, tail
 * angle as a state-machine number input). That polish path is reserved —
 * `src` is accepted but unused; the Component will branch on it once a
 * real bubble.riv lands. No schema change at that point.
 */

/* ─── Speaker → tail resolution ─────────────────────────────────── */

type ForegroundSection = {
  foreground?:
    | { regions?: Record<string, unknown> }
    | unknown
}

function findSpeakerAnchor(
  unit: { parentConfig: ForegroundSection } | undefined,
  speakerWho: string | undefined
): CharacterAnchor | undefined {
  if (!unit || !speakerWho) return undefined
  const fg = unit.parentConfig.foreground
  if (!fg || typeof fg !== 'object' || Array.isArray(fg) || !('regions' in fg)) {
    return undefined
  }
  const regions = (fg as { regions?: Record<string, unknown> }).regions
  if (!regions) return undefined
  const stage = regions.stage
  if (!stage) return undefined
  const layers = Array.isArray(stage) ? stage : [stage]
  for (const layer of layers) {
    if (
      typeof layer !== 'object' ||
      layer == null ||
      (layer as { type?: unknown }).type !== 'kz:character'
    ) {
      continue
    }
    if ((layer as { who?: unknown }).who === speakerWho) {
      const anchor = (layer as { anchor?: CharacterAnchor }).anchor
      return anchor ?? { x: 'center', y: 'bottom' }
    }
  }
  return undefined
}

function anchorToTailAt(anchor: CharacterAnchor): BubbleTailAt {
  // Bubbles default to the upper third of the panel, so the tail always
  // points DOWN at a character standing below. The horizontal direction
  // is what changes with the speaker's x.
  const NAMED_X: Record<'left' | 'center' | 'right', number> = {
    left: 0.1,
    center: 0.5,
    right: 0.9,
  }
  const xFraction = typeof anchor.x === 'number' ? anchor.x : NAMED_X[anchor.x]
  if (xFraction < 0.35) return 'bottom-left'
  if (xFraction > 0.65) return 'bottom-right'
  return 'bottom-center'
}

/* ─── Tone palette ──────────────────────────────────────────────── */

interface ToneTokens {
  background: string
  borderColor: string
  borderWidth: string
  borderStyle: 'solid' | 'dashed'
  borderRadius: string
  color: string
  fontStyle?: 'italic'
  fontWeight?: number
  fontSize?: string
  padding: string
}

const TONES: Record<BubbleTone, ToneTokens> = {
  gentle: {
    background: '#ffffff',
    borderColor: 'var(--color-accent, #ff7aa9)',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderRadius: '22px',
    color: 'var(--color-text, #3d2a17)',
    padding: '0.875rem 1.125rem',
  },
  loud: {
    background: 'var(--color-amber, #ffd54d)',
    borderColor: 'var(--color-text, #3d2a17)',
    borderWidth: '3px',
    borderStyle: 'solid',
    borderRadius: '16px',
    color: 'var(--color-text, #3d2a17)',
    fontWeight: 700,
    fontSize: '1.1em',
    padding: '1rem 1.25rem',
  },
  whisper: {
    background: 'rgba(255,255,255,0.85)',
    borderColor: 'var(--color-muted, #9a7d65)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderRadius: '24px',
    color: 'var(--color-muted, #9a7d65)',
    fontStyle: 'italic',
    padding: '0.75rem 1rem',
  },
  thought: {
    background: '#ffffff',
    borderColor: 'var(--color-accent2, #65d0d0)',
    borderWidth: '2px',
    borderStyle: 'solid',
    // Bumpy cloud-ish radii.
    borderRadius: '42% 58% 56% 44% / 46% 50% 50% 54%',
    color: 'var(--color-text, #3d2a17)',
    fontStyle: 'italic',
    padding: '1rem 1.25rem',
  },
}

/* ─── Tail geometry ─────────────────────────────────────────────── */

const TAIL_SIZE = 14 // CSS pixels — the triangle's perpendicular extent

/**
 * Returns absolute-positioned styles for a single CSS triangle that pokes
 * out of the bubble at the requested corner. Color matches the bubble
 * fill; the border seam is left visible (good enough for phase 3).
 */
function tailStyle(at: BubbleTailAt, tokens: ToneTokens): CSSProperties {
  const baseTriangle: CSSProperties = {
    position: 'absolute',
    width: 0,
    height: 0,
  }
  const fill = tokens.background
  const transparent = `${TAIL_SIZE}px solid transparent`
  const triangle = `${TAIL_SIZE}px solid ${fill}`

  switch (at) {
    case 'bottom-left':
      return {
        ...baseTriangle,
        left: '12%',
        bottom: -TAIL_SIZE,
        borderLeft: transparent,
        borderRight: transparent,
        borderTop: triangle,
      }
    case 'bottom-center':
      return {
        ...baseTriangle,
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: -TAIL_SIZE,
        borderLeft: transparent,
        borderRight: transparent,
        borderTop: triangle,
      }
    case 'bottom-right':
      return {
        ...baseTriangle,
        right: '12%',
        bottom: -TAIL_SIZE,
        borderLeft: transparent,
        borderRight: transparent,
        borderTop: triangle,
      }
    case 'top-left':
      return {
        ...baseTriangle,
        left: '12%',
        top: -TAIL_SIZE,
        borderLeft: transparent,
        borderRight: transparent,
        borderBottom: triangle,
      }
    case 'top-center':
      return {
        ...baseTriangle,
        left: '50%',
        transform: 'translateX(-50%)',
        top: -TAIL_SIZE,
        borderLeft: transparent,
        borderRight: transparent,
        borderBottom: triangle,
      }
    case 'top-right':
      return {
        ...baseTriangle,
        right: '12%',
        top: -TAIL_SIZE,
        borderLeft: transparent,
        borderRight: transparent,
        borderBottom: triangle,
      }
  }
}

/* ─── Component ─────────────────────────────────────────────────── */

const DEFAULT_POSITION = { x: '50%', y: '18%' }

function pickStepwiseText(
  stepwise: (string | null)[],
  activeStep: number
): string | null {
  if (stepwise.length === 0) return null
  const clamped = Math.min(Math.max(activeStep, 0), stepwise.length - 1)
  return stepwise[clamped]
}

export default function KzBubbleComponent(
  props: VizRenderProps<KzBubbleConfig>
) {
  const { config, activeStep, noteReady } = props

  // All hooks fire before any conditional return so React's hook order
  // stays stable across the unmount path below.
  useEffect(() => {
    noteReady()
  }, [noteReady])
  const ctx = useForegroundContent()

  // Visibility — visibleOn restricts to a step allowlist; null text
  // entries also hide on those individual steps. Either path → unmount.
  const isOnVisibleStep =
    config.visibleOn == null || config.visibleOn.includes(activeStep)
  const text = pickStepwiseText(config.textStepwise, activeStep)
  if (!isOnVisibleStep || text == null) return null

  // Tail direction: explicit `tailAt` wins, else derived from `speaker`,
  // else `bottom-center` (assumes character below).
  const speakerAnchor = findSpeakerAnchor(ctx?.unit, config.speaker)
  const tailAt: BubbleTailAt =
    config.tailAt ??
    (speakerAnchor ? anchorToTailAt(speakerAnchor) : 'bottom-center')

  const tokens = TONES[config.tone ?? 'gentle']
  const { x, y } = config.position ?? DEFAULT_POSITION

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translateX(-50%)',
        maxWidth: 'min(360px, 70vw)',
        background: tokens.background,
        border: `${tokens.borderWidth} ${tokens.borderStyle} ${tokens.borderColor}`,
        borderRadius: tokens.borderRadius,
        color: tokens.color,
        fontStyle: tokens.fontStyle,
        fontWeight: tokens.fontWeight,
        fontSize: tokens.fontSize,
        padding: tokens.padding,
        fontFamily: 'var(--font-sans, sans-serif)',
        lineHeight: 1.4,
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
        pointerEvents: 'none',
      }}
    >
      {text}
      {/* The `thought` tone is a cloud — no tail, just the bumpy radii. */}
      {config.tone !== 'thought' && <div style={tailStyle(tailAt, tokens)} />}
    </div>
  )
}
