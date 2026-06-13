/**
 * Kidzovo character palette.
 *
 * Day-one scope: one bundled character (Ovi). Adding a character means a
 * matching .riv with a state-machine number input (default name: `pose`)
 * whose enumerated integer values match the entries in `poses` below —
 * AND an `inputs` schema declaring every state-machine input the .riv
 * exposes (each rive carries its OWN schema; see `RiveInputSchema`).
 *
 * Ovi's .riv ships from `apps/vizmaya-fyi/public/kidzovo-demo/owl.riv`.
 * If the file's state-machine input is named something other than `pose`
 * or its pose enum maps to different integers, adjust `poseInputName`
 * and the `poses` map below — no module code changes needed.
 */

import type { RiveInputSchema } from '../types'
import { resolveCostume } from './riveInputs'

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
   * legacy .riv conventions to something else. Must be declared in
   * `inputs` as a number input (asserted at module init).
   */
  poseInputName: string
  /**
   * Pose name → numeric value written to the `poseInputName` input. The
   * values must match the enum encoding chosen inside the .riv, and must
   * agree with `inputs[poseInputName].values` (asserted at module init —
   * share one object for both to make that true by construction).
   */
  poses: Record<string, number>
  /**
   * This .riv's OWN input schema: every state-machine input it exposes,
   * with what we've confirmed about each enum. `kz:character` validates
   * YAML `costume` maps against it at parse time; `defaultCostume` below
   * is validated against it at module init. Keep it in sync with what
   * /inspect-riv reports for the .riv.
   */
  inputs: RiveInputSchema
  /** View-model bindings always applied for this character (e.g. brand colors). */
  defaultBindings?: Record<string, string | number | boolean>
  /**
   * Baseline state-machine input writes applied on every panel — per-layer
   * `costume` overrides merge on top. Important because state-machine inputs
   * persist across panels when the rive instance is shared via
   * `stableIdentity` — without a baseline, a costume set on one panel would
   * stick to subsequent panels that meant to render in defaults.
   */
  defaultCostume?: Record<string, number | boolean>
}

/**
 * Ovi's pose enum — single source of truth, referenced by BOTH `poses`
 * (the kz:character pose API) and `inputs.State.values` (the .riv input
 * schema) so the two cannot drift apart.
 */
const OVI_POSES: Record<string, number> = {
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
    /**
     * owl.riv's input schema — what /inspect-riv reports for
     * "State Machine Main", annotated with what visual inspection has
     * confirmed about each enum so far. Inputs without `values` have
     * undiscovered enums: numbers pass validation but are unverified
     * (see data/riveInputs.ts for the policy), except values recorded
     * in `brokenValues`, which always error.
     */
    inputs: {
      State: {
        kind: 'number',
        values: OVI_POSES,
        enumComplete: true,
        doc:
          'Pose selector. Named values are the pose map — integers match the ' +
          '.riv animation-name prefixes (e.g. "3  Painting" → 3); the ' +
          'unprefixed "Idle" animation is 0. Normally driven per-step via ' +
          '`pose`, not `costume`.',
      },
      Headgear: {
        kind: 'number',
        values: { hair: 0 },
        doc:
          '0 = "Hair" (bare head, no hat) — confirmed visually. Other values ' +
          'swap in headgear (the demo story uses 1 and 13) but the full enum ' +
          'is undiscovered; numbers beyond the named ones are unverified.',
      },
      Muffler: {
        kind: 'number',
        values: { default: 0 },
        doc:
          '0 = default yellow muffler — confirmed visually. Other colorways ' +
          'exist (the demo story uses 2 and 5) but the full enum is ' +
          'undiscovered; numbers beyond the named ones are unverified.',
      },
      Specs: {
        kind: 'number',
        doc:
          'Eyewear layer. Enum undiscovered — not even the "no specs" value ' +
          'is confirmed yet; any number passes validation but is unverified.',
      },
      BG: {
        kind: 'number',
        brokenValues: {
          0: 'turns the owl into a red rectangle (confirmed by visual inspection)',
        },
        doc:
          'Backdrop layer. Enum undiscovered — numbers are unverified, and 0 ' +
          'is confirmed broken (red rectangle), so it is rejected outright.',
      },
      Skin: {
        kind: 'number',
        doc:
          'Plumage/skin tint. Enum undiscovered — no value confirmed yet; ' +
          'any number passes validation but is unverified.',
      },
    },
    // Baseline costume so panels without an explicit `costume` block render
    // the .riv's bare-Ovi look instead of inheriting whatever a previous
    // panel last set. Only includes inputs whose default value is confirmed
    // safe by visual inspection (Headgear: hair, Muffler: default yellow).
    // `Specs`, `BG`, and `Skin` are omitted because their "default" integer
    // is still undiscovered (see `inputs` docs above) — until we discover
    // those values (e.g. via Rive Studio or by probing the .riv enums), any
    // costume override of those inputs will persist into subsequent panels.
    defaultCostume: {
      Headgear: 0,
      Muffler: 0,
    },
    poses: OVI_POSES,
  },
}

export function resolveCharacter(who: string): CharacterEntry | undefined {
  return characters[who]
}

export function listCharacters(): string[] {
  return Object.keys(characters)
}

/* ─── Palette self-validation (module init) ─────────────────────── */

/**
 * Dev-time assert: each palette entry must be consistent with its own
 * declared input schema. Runs once at module init so a palette edit that
 * drifts from the schema fails loudly on the first import rather than
 * rendering wrong. (The data is static, so if this passes once it always
 * passes — no runtime cost concern.)
 */
function assertCharacterConsistent(id: string, entry: CharacterEntry): void {
  const poseInput = entry.inputs[entry.poseInputName]
  if (!poseInput) {
    throw new Error(
      `characters.ts: '${id}' declares poseInputName '${entry.poseInputName}' but inputs has no such entry`
    )
  }
  if (poseInput.kind !== 'number') {
    throw new Error(
      `characters.ts: '${id}' poseInputName '${entry.poseInputName}' must be a number input (declared as ${poseInput.kind})`
    )
  }
  // Cross-validate poses ↔ the pose input's named values. Ovi shares one
  // object for both so this is true by construction — the check guards
  // future characters that hand-write the two maps separately.
  if (poseInput.values) {
    for (const [pose, value] of Object.entries(entry.poses)) {
      if (poseInput.values[pose] !== value) {
        throw new Error(
          `characters.ts: '${id}' pose '${pose}' (${value}) disagrees with inputs.${entry.poseInputName}.values['${pose}'] (${poseInput.values[pose] ?? 'missing'})`
        )
      }
    }
  }
  if (entry.defaultCostume) {
    resolveCostume(
      entry.defaultCostume,
      entry.inputs,
      `characters.ts '${id}'.defaultCostume`
    )
  }
}

for (const [id, entry] of Object.entries(characters)) {
  assertCharacterConsistent(id, entry)
}
