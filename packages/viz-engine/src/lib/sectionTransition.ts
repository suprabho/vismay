import type { SectionTransition, StageEasing, TransitionDirection } from './storyConfig.types'

/**
 * Resolve a section's `transition.foreground` spec into the concrete
 * enter-transition the foreground slots play, applying the boundary-level
 * `durationMs`/`easing` defaults. Returns null for absent config or
 * `kind: 'cut'` — the identity path, today's hard swap.
 */
export interface ResolvedEnterTransition {
  kind: 'fade' | 'slide'
  direction: TransitionDirection
  durationMs: number
  easing: StageEasing
}

export function resolveForegroundTransition(
  transition: SectionTransition | undefined
): ResolvedEnterTransition | null {
  const spec = transition?.foreground
  if (!spec || spec.kind === 'cut') return null
  return {
    kind: spec.kind,
    direction: spec.direction ?? 'up',
    durationMs: spec.durationMs ?? transition?.durationMs ?? 500,
    easing: spec.easing ?? transition?.easing ?? 'easeOut',
  }
}

/** Resolved background crossfade for a boundary, or null for 'hold' (today). */
export interface ResolvedBackgroundFade {
  durationMs: number
  easing: StageEasing
}

export function resolveBackgroundTransition(
  transition: SectionTransition | undefined
): ResolvedBackgroundFade | null {
  if (transition?.background !== 'crossfade') return null
  return {
    durationMs: transition.durationMs ?? 500,
    easing: transition.easing ?? 'easeInOut',
  }
}
