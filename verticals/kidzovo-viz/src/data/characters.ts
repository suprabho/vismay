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
    // Discovered via apps/kidzovo/web/app/inspect-riv/page.tsx — the .riv
    // ships with a "Mascot" artboard whose "State Machine Main" has a
    // `State` number input. The integer values match the animation name
    // prefixes (e.g. "3  Painting" → State = 3). The unprefixed "Idle"
    // animation is the default state.
    artboard: 'Mascot',
    stateMachine: 'State Machine Main',
    poseInputName: 'State',
    poses: {
      // Default / quiet poses
      idle: 0,
      homepage: 1,
      recommendations: 2,
      painting: 3,
      listening: 4,
      talking: 5,
      // Outcome / status poses
      waiting: 101,
      success: 102,
      retry: 103,
      failure: 104,
      partialSuccess1: 105,
      partialSuccess2: 106,
      partialSuccess3: 107,
      partialSuccess4: 108,
      denial: 109,
    },
  },
}

export function resolveCharacter(who: string): CharacterEntry | undefined {
  return characters[who]
}

export function listCharacters(): string[] {
  return Object.keys(characters)
}
