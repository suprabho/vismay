/**
 * Validation + name resolution for per-rive input schemas.
 *
 * Each character's .riv declares its OWN `RiveInputSchema` (see
 * `data/characters.ts`). These helpers enforce it in two places:
 *
 *   1. `kz:character` parseConfig — every YAML `costume` map is resolved
 *      against the character's schema, so typos, type mismatches, trigger
 *      writes, and known-broken values fail the story PARSE instead of
 *      silently no-opping at render time.
 *   2. characters.ts module init — each palette entry's `defaultCostume`
 *      runs through the same resolver, so the palette can't drift from its
 *      own declared schema.
 *
 * Unconfirmed-enum policy: a .riv's enums are opaque from outside Rive
 * Studio. A number input whose enum is NOT fully discovered
 * (`enumComplete` unset) accepts any finite number — the costume system
 * shipped using such values, so blocking them would break working stories.
 * The descriptor's `doc` is the place to record that they're unverified.
 * Two hard exceptions:
 *   - values recorded in `brokenValues` error with the recorded reason;
 *   - inputs marked `enumComplete: true` reject numbers outside `values`.
 */

import type { RiveInputSchema } from '../types'

/** Inputs a costume map may write to — everything except triggers. */
export function settableInputNames(inputs: RiveInputSchema): string[] {
  return Object.keys(inputs).filter((name) => inputs[name].kind !== 'trigger')
}

function describeNamedValues(values: Record<string, number>): string {
  return Object.entries(values)
    .map(([name, value]) => `${name} (${value})`)
    .join(', ')
}

/**
 * Validate ONE costume entry against the schema and resolve value names to
 * numbers. Throws with a `where`-prefixed message on any violation.
 */
export function resolveCostumeValue(
  name: string,
  value: unknown,
  inputs: RiveInputSchema,
  where: string
): number | boolean {
  const descriptor = inputs[name]
  if (!descriptor) {
    throw new Error(
      `${where}['${name}']: '${name}' is not a declared input on this character's .riv. Valid inputs: ${settableInputNames(inputs).join(', ')}`
    )
  }
  if (descriptor.kind === 'trigger') {
    throw new Error(
      `${where}['${name}']: '${name}' is a trigger input — triggers are momentary events fired at runtime, not state, so they cannot be set via costume`
    )
  }
  if (descriptor.kind === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new Error(
        `${where}['${name}']: expected a boolean (got ${typeof value})`
      )
    }
    return value
  }

  // descriptor.kind === 'number'
  if (typeof value === 'string') {
    const resolved = descriptor.values?.[value]
    if (resolved === undefined) {
      const hint = descriptor.values
        ? `Known names: ${describeNamedValues(descriptor.values)}`
        : 'This input has no confirmed named values yet — use a number'
      throw new Error(
        `${where}['${name}']: '${value}' is not a known value name for '${name}'. ${hint}`
      )
    }
    return resolved
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `${where}['${name}']: expected a number or a named value string (got ${typeof value})`
    )
  }
  const brokenReason = descriptor.brokenValues?.[value]
  if (brokenReason !== undefined) {
    throw new Error(
      `${where}['${name}']: ${value} is a known-broken value for '${name}' — ${brokenReason}`
    )
  }
  const isNamed =
    descriptor.values != null &&
    Object.values(descriptor.values).includes(value)
  if (!isNamed && descriptor.enumComplete) {
    throw new Error(
      `${where}['${name}']: ${value} is not one of '${name}''s values. Valid: ${describeNamedValues(descriptor.values ?? {})}`
    )
  }
  // Unconfirmed-enum policy: the enum isn't fully discovered, so unlisted
  // numbers pass through unverified (see module doc above).
  return value
}

/**
 * Validate + resolve a whole costume map against a character's declared
 * input schema. Returns numbers/booleans only — value names are resolved —
 * so the result feeds straight into the engine rive module's permissive
 * `staticInputs`. Throws on the first violation.
 */
export function resolveCostume(
  raw: Record<string, unknown>,
  inputs: RiveInputSchema,
  where: string
): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {}
  for (const [name, value] of Object.entries(raw)) {
    out[name] = resolveCostumeValue(name, value, inputs, where)
  }
  return out
}
