/**
 * Shared types for the Kidzovo vertical's viz modules.
 *
 * Module catalog (see docs/kidzovo-vertical-plan.md §5):
 *   - kz:character — Rive-backed character with named poses (phase 2).
 *   - kz:bubble   — Speech bubble with per-step text + tail (phase 3).
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

/**
 * Bubble visual register. Maps to per-tone CSS variants in the bubble
 * Component (border weight, color, fill, italic/bold) and — once a real
 * bubble.riv ships — to a state-machine number input that picks a
 * matching artboard variant.
 *
 *   gentle  → soft pink border, regular weight. The default.
 *   loud    → bold amber fill, heavy black border, larger text.
 *   whisper → light dashed border, muted italic text.
 *   thought → cloud-shape (bumpy radii), italic, no tail.
 */
export type BubbleTone = 'gentle' | 'loud' | 'whisper' | 'thought'

/**
 * Anchored corner the tail points OUT OF the bubble. The tail terminates
 * at the speaker's general direction; `bottom-center` is the most common
 * choice when the speaker is roughly under the bubble (which is the case
 * for the default kz-storybook layout: character on stage floor, bubble
 * in the upper third).
 */
export type BubbleTailAt =
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'top-left'
  | 'top-center'
  | 'top-right'

/**
 * Manual placement override. Both axes accept any CSS length (`'20%'`,
 * `'4rem'`, `'120px'`). Omitting `position` falls back to the layout's
 * default upper-right bubble slot.
 */
export interface BubblePosition {
  x: string
  y: string
}

export interface KzBubbleConfig {
  type: 'kz:bubble'
  /**
   * Optional .riv override. When present, the Component will (in a future
   * phase) layer the rive bubble under the HTML text overlay. For now it's
   * accepted by parseConfig but the Component renders CSS — see
   * `modules/bubble/Component.tsx` for the path forward.
   */
  src?: string
  /**
   * Which steps the bubble shows on. Indices into the section's `activeStep`.
   * Omit to show on every step the section is active.
   */
  visibleOn?: number[]
  /**
   * Which character (`who` field on a `kz:character` in the same section's
   * stage region) the tail points at. Resolved at runtime; falls back to
   * `tailAt` if no matching speaker is on stage.
   */
  speaker?: string
  /** Visual register. Default: 'gentle'. */
  tone?: BubbleTone
  /**
   * Per-step body text. Indexed by `activeStep`; nulls hide the bubble on
   * that step (in addition to the `visibleOn` filter). Length should match
   * the section's step count; shorter arrays clamp to the last entry.
   */
  textStepwise: (string | null)[]
  /** Explicit tail direction override. Defaults from `speaker` (or `bottom-center`). */
  tailAt?: BubbleTailAt
  /** Manual placement on the bubbles region. Defaults to upper-right slot. */
  position?: BubblePosition
}
