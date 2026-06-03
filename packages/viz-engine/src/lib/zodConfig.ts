/**
 * Zod is the single source of truth for layer-config validation.
 *
 * Each module owns a Zod schema (e.g. `bigStatSchema`) that replaces its
 * hand-written `parseConfig` body AND feeds the AI generation path: the schema
 * is what the model's structured output is constrained to, so a generated
 * section can never produce a layer that fails to parse. One schema, three
 * consumers — the renderer's validator, the AI tool-call contract, and the
 * `.describe()` field docs the model reads.
 *
 * `parseConfig` stays the module's public entry point (the registry and the
 * engine call it); it now just delegates to the schema via `parseWithSchema`,
 * which preserves the existing `${ctx.label}: …` error contract so validation
 * messages still point at the offending section.
 */

import { z } from 'zod'

/** Parse context threaded through every module's `parseConfig`. */
export interface ParseCtx {
  slug: string
  label: string
}

/**
 * Theme palette tokens that read as a foreground accent. Mirrors `StatColor`
 * in `storyConfig.types` (kept in lockstep — see that type's doc comment).
 * `bigStat`'s `deltaColor` (`StatColor | 'positive'`) collapses to this set
 * because `StatColor` already includes `positive`.
 */
export const StatColorSchema = z.enum([
  'accent',
  'accent2',
  'red',
  'positive',
  'amber',
  'teal',
  'muted',
])

/** Horizontal alignment shared by several text/stat layers. */
export const AlignSchema = z.enum(['left', 'center', 'right'])

/**
 * Run `raw` through a module's Zod schema, re-throwing any validation failure
 * as a `${ctx.label}: …` error so the message keeps pointing at the section the
 * way the legacy hand-written `parseConfig` checks did. Returns the parsed,
 * defaulted config on success.
 */
export function parseWithSchema<S extends z.ZodTypeAny>(
  schema: S,
  raw: unknown,
  ctx: ParseCtx,
): z.output<S> {
  const result = schema.safeParse(raw)
  if (result.success) return result.data
  const issue = result.error.issues[0]
  const path = issue.path.join('.')
  throw new Error(`${ctx.label}: ${path ? `'${path}' — ` : ''}${issue.message}`)
}
