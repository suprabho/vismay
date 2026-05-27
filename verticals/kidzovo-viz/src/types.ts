/**
 * Shared types for the Kidzovo vertical's viz modules.
 *
 * The full module catalog (see docs/kidzovo-vertical-plan.md §5) is:
 *   - kz:character — Rive-backed character with named poses (phase 2).
 *   - kz:bubble   — Rive-backed speech bubble (phase 3).
 *
 * This file currently carries only what phase 2 needs. Bubble + tone +
 * tail-anchor types land alongside the bubble module in phase 3.
 */

/**
 * A named character pose. Each character entry in `data/characters.ts`
 * declares a `poses: Record<string, number>` map that resolves these
 * strings to the numeric value written to the .riv state-machine input.
 */
export type CharacterPose = string

/**
 * Per-step pose. Either a single static pose for the whole section, or a
 * `stepwise` array indexed by `activeStep`. Nulls in `stepwise` fall
 * through to the most recent non-null pose (so authors can write only the
 * frames where the pose changes).
 */
export type CharacterPoseConfig =
  | { static: CharacterPose }
  | { stepwise: (CharacterPose | null)[] }

/**
 * Where on the stage region the character sits. Numbers are 0..1 fractions
 * of the stage width/height; named edges are friendly aliases.
 *
 *   y: 'bottom' anchors the character's bottom edge to the stage floor —
 *     the natural treatment for a character standing on the ground.
 *   y: 'top' / 'center' / numeric anchor the character's CENTER vertically
 *     (use a fraction to place the figure above the floor).
 */
export interface CharacterAnchor {
  x: number | 'left' | 'center' | 'right'
  y: number | 'top' | 'center' | 'bottom'
}

export interface KzCharacterConfig {
  type: 'kz:character'
  /** Lookup key into `data/characters.ts` (e.g. 'ovi'). Validated at parse time. */
  who: string
  /** Override the bundled .riv. Default comes from the palette entry. */
  src?: string
  /** Override the artboard. Default from palette. */
  artboard?: string
  /** Override the state machine. Default from palette. */
  stateMachine?: string
  /** Per-step pose. Indexed by activeStep when `stepwise`. */
  pose?: CharacterPoseConfig
  /**
   * Below this step the character is opacity 0. Drives a CSS fade on the
   * wrapper, not a Rive concern — keeps the .riv author surface simple.
   */
  visibleFrom?: number
  /** Anchor on the stage region. Default: bottom-center. */
  anchor?: CharacterAnchor
  /**
   * Rive view-model bindings forwarded to the underlying rive module
   * (color tokens, named numbers, etc.). Layered on top of the palette
   * entry's `defaultBindings`.
   */
  bindings?: Record<string, string | number | boolean>
}
