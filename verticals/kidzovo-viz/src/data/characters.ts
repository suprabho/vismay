/**
 * Kidzovo character palette.
 *
 * Day-one scope: one bundled character (Ovi). Adding a character means a
 * matching .riv with a state-machine number input (default name: `pose`)
 * whose enumerated integer values match the entries in `poses` below.
 *
 * Ovi's .riv ships from `apps/vizmaya-fyi/public/kidzovo-demo/owl.riv`.
 * If the file's state-machine input is named something other than `pose`
 * or its pose enum maps to different integers, adjust `poseInputName`
 * and the `poses` map below — no module code changes needed.
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
    src: '/kidzovo-demo/owl.riv',
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
