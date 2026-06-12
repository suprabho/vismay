/** Throwaway check: per-rive input schemas — named-value resolution, typo
 *  keys, type mismatches, trigger rejection, known-broken values, the
 *  unconfirmed-enum pass-through policy, and the demo story's costumes.
 *  (run from verticals/kidzovo-viz: npx tsx src/__fixtures__/riveInputSchema.test.ts) */
import { characters } from '../data/characters'
import { resolveCostume } from '../data/riveInputs'
import characterModule from '../modules/character'
import type { RiveInputSchema } from '../types'

const ok = (label: string, pass: boolean, extra = '') =>
  console.log(`${pass ? '✓' : '✗'} ${label}${extra ? `  ${extra}` : ''}`)

const ctx = { slug: 'test-story', label: 'section-0' }
const base = { type: 'kz:character', who: 'ovi' }

/** Run fn, return the error message (or null if it didn't throw). */
const failsWith = (fn: () => unknown): string | null => {
  try {
    fn()
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

// ── module init: characters.ts validated its own defaultCostume ────────────
ok('palette init passes (importing characters.ts did not throw)', !!characters.ovi)
ok(
  'poses and inputs.State.values are the same enum',
  characters.ovi.poses === (characters.ovi.inputs.State as { values?: object }).values
)

// ── named-value resolution ──────────────────────────────────────────────────
const named = characterModule.parseConfig(
  { ...base, costume: { Headgear: 'hair', Muffler: 0 } },
  ctx
)
ok(
  "costume { Headgear: 'hair' } resolves to 0",
  named.costume?.Headgear === 0 && named.costume?.Muffler === 0
)

const poseByName = characterModule.parseConfig(
  { ...base, costume: { State: 'painting' } },
  ctx
)
ok("State by pose name resolves ('painting' → 3)", poseByName.costume?.State === 3)

// ── unconfirmed-enum policy: unverified numbers pass ────────────────────────
const unverified = characterModule.parseConfig(
  { ...base, costume: { Specs: 3, BG: 5, Headgear: 13 } },
  ctx
)
ok(
  'unverified numbers on undiscovered enums pass (Specs: 3, BG: 5, Headgear: 13)',
  unverified.costume?.Specs === 3 &&
    unverified.costume?.BG === 5 &&
    unverified.costume?.Headgear === 13
)

// ── typo key ────────────────────────────────────────────────────────────────
const typo = failsWith(() =>
  characterModule.parseConfig({ ...base, costume: { Hedgear: 1 } }, ctx)
)
ok(
  'typo key rejected, error lists the valid inputs',
  !!typo && typo.includes('Hedgear') && typo.includes('Headgear') && typo.includes('Muffler')
)

// ── wrong value type ────────────────────────────────────────────────────────
const wrongType = failsWith(() =>
  characterModule.parseConfig({ ...base, costume: { Headgear: true } }, ctx)
)
ok('boolean on a number input rejected', !!wrongType && wrongType.includes('number'))

const unknownName = failsWith(() =>
  characterModule.parseConfig({ ...base, costume: { Specs: 'round' } }, ctx)
)
ok(
  'value name on an input with no confirmed names rejected',
  !!unknownName && unknownName.includes('no confirmed named values')
)

// ── trigger rejection (Ovi declares no triggers — use a synthetic schema) ───
const withTrigger: RiveInputSchema = {
  Confetti: { kind: 'trigger', doc: 'celebration burst' },
}
const trigger = failsWith(() => resolveCostume({ Confetti: 1 }, withTrigger, 'test'))
ok('trigger input rejected', !!trigger && trigger.includes('trigger'))

// ── known-broken value ──────────────────────────────────────────────────────
const broken = failsWith(() =>
  characterModule.parseConfig({ ...base, costume: { BG: 0 } }, ctx)
)
ok('BG: 0 rejected with the recorded reason', !!broken && broken.includes('red rectangle'))

// ── enumComplete: State is a closed enum ────────────────────────────────────
const stateOutside = failsWith(() =>
  characterModule.parseConfig({ ...base, costume: { State: 50 } }, ctx)
)
ok('enumComplete input rejects a number outside its values', !!stateOutside)
const stateNumeric = characterModule.parseConfig(
  { ...base, costume: { State: 101 } },
  ctx
)
ok('enumComplete input accepts a listed raw number (State: 101)', stateNumeric.costume?.State === 101)

// ── the demo story's costume blocks all still parse ─────────────────────────
// (apps/kidzovo/web/content/stories/ovi-messy-room.config.yaml)
const demoCostumes: Record<string, unknown>[] = [
  { Headgear: 1, Muffler: 2 }, // toys-go-everywhere
  { Specs: 3 }, // ovi-notices
  { Headgear: 13, Muffler: 5, BG: 5 }, // one-toy-at-a-time
]
ok(
  'ovi-messy-room costume blocks stay valid',
  demoCostumes.every(
    (costume) => failsWith(() => characterModule.parseConfig({ ...base, costume }, ctx)) === null
  )
)
