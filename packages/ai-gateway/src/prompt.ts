/**
 * Typed prompt templates.
 *
 * One `Prompt` definition owns its system text + user template + the shape of
 * its parameters. Call sites fill it and hand the result to `generateText` /
 * `generateImage`. Keeps prompts versionable (the `id` field is part of the
 * cache key) and lets the same template be replayed deterministically from
 * stored params later.
 *
 * Example:
 *   const summarisePrompt = definePrompt({
 *     id: 'energy.country-summary.v1',
 *     system: 'You write short editorial blurbs…',
 *     template: (p: { name: string; mix: string }) =>
 *       `Country: ${p.name}\nMix: ${p.mix}\n`,
 *   })
 *   const { user, system } = summarisePrompt.fill({ name: 'India', mix: 'coal 70%' })
 *   await generateText({ model: 'text.fast', system, prompt: user })
 */

export interface Prompt<P> {
  readonly id: string
  readonly system: string | undefined
  fill(params: P): { system: string | undefined; user: string }
}

export function definePrompt<P>(opts: {
  /** Stable identifier — include a version suffix (`.v1`) so cache hits invalidate on edit. */
  id: string
  system?: string
  template: (params: P) => string
}): Prompt<P> {
  return {
    id: opts.id,
    system: opts.system,
    fill(params) {
      return { system: opts.system, user: opts.template(params) }
    },
  }
}
