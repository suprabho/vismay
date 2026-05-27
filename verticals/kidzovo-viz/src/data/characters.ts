/**
 * Kidzovo character palette.
 *
 * Day-one scope: one bundled character (Ovi). Adding a character means a
 * matching .riv with a state-machine number input (default name: `pose`)
 * whose enumerated integer values match the entries in `poses` below.
 *
 * IMPORTANT: Ovi's `src` is currently a PLACEHOLDER pointing at
 * `vizmaya-logo.riv`. The wrapper module wires up the .riv correctly —
 * mount, anchor, fade — but pose changes won't render visually until a
 * real Ovi.riv with the `pose` input lands. Swap `src` here when it does
 * (no module changes needed).
 */

export interface CharacterEntry {
  /** Default .riv source. Overridable per layer via `KzCharacterConfig.src`. */
  src: string
  /** Default artboard. Optional — many .riv files have a single artboard. */
  artboard?: string
  /** Default state machine name. Optional — defaults to the .riv's first SM. */
  stateMachine?: string
  /**
   * Name of the state-machine number input the character listens to for
   * pose changes. Convention: `pose`. Different per-character only if a
   * legacy .riv conventions to something else.
   */
  poseInputName: string
  /**
   * Pose name → numeric value written to the `poseInputName` input. The
   * values must match the enum encoding chosen inside the .riv.
   */
  poses: Record<string, number>
  /** View-model bindings always applied for this character (e.g. brand colors). */
  defaultBindings?: Record<string, string | number | boolean>
}

export const characters: Record<string, CharacterEntry> = {
  ovi: {
    // TODO(kidzovo-phase-2): swap to the real Ovi.riv once authoring lands.
    src: '/vizmaya-logo.riv',
    poseInputName: 'pose',
    poses: {
      standing: 0,
      throwing: 1,
      sitting: 2,
      picking: 3,
    },
  },
}

export function resolveCharacter(who: string): CharacterEntry | undefined {
  return characters[who]
}

export function listCharacters(): string[] {
  return Object.keys(characters)
}
