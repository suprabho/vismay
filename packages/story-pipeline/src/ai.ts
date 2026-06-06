import { generateText } from '@vismay/ai-gateway'
import type { z } from 'zod'
import { DEFAULT_TEXT_MODEL } from './models'

/**
 * Robust structured generation.
 *
 * Some models — notably Gemini in JSON structured-output mode — cannot satisfy
 * schemas containing discriminated unions (our section `body` has two, via
 * viz-engine's genSchema). The failure surfaces as "No object generated:
 * response did not match schema" or an opaque gateway error. Models that do
 * structured output via tool-calling (Claude, GPT) handle the full JSON schema,
 * so on any failure we retry ONCE with such a model.
 *
 * The thrown error includes the underlying detail (finishReason, cause) from
 * BOTH attempts so a genuine schema/content problem is diagnosable.
 */
export async function generateStructured<S extends z.ZodType>(opts: {
  model?: string
  system: string
  prompt: string
  schema: S
  metadata?: Record<string, string>
}): Promise<z.infer<S>> {
  const primary = opts.model || DEFAULT_TEXT_MODEL
  try {
    const { result } = await generateText({
      model: primary,
      system: opts.system,
      prompt: opts.prompt,
      schema: opts.schema,
      metadata: opts.metadata,
    })
    return result
  } catch (primaryErr) {
    const fallback = primary.includes('claude') ? 'text.proPlus' : 'text.claude'
    try {
      const { result } = await generateText({
        model: fallback,
        system: opts.system,
        prompt: opts.prompt,
        schema: opts.schema,
        metadata: { ...opts.metadata, fallbackFrom: primary },
      })
      return result
    } catch (fallbackErr) {
      throw new Error(
        `structured generation failed — ${primary}: ${describeGenError(primaryErr)}; ` +
          `fallback ${fallback}: ${describeGenError(fallbackErr)}`,
      )
    }
  }
}

/** Pull the useful bits out of an AI SDK / gateway error for logging. */
export function describeGenError(e: unknown): string {
  if (!(e instanceof Error)) return String(e)
  const any = e as Error & { finishReason?: string; cause?: { message?: string } }
  const parts = [e.message]
  if (any.finishReason) parts.push(`finishReason=${any.finishReason}`)
  if (any.cause?.message) parts.push(`cause=${any.cause.message}`)
  return parts.join(' | ')
}
