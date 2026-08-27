/**
 * Structured-output wrapper for the Nashta AI calls: retries transient
 * failures and salvages the classic double-wrap flub where the model returns
 * the payload as a JSON *string* under the top-level key (which fails the
 * provider-level schema validation with AI_NoObjectGeneratedError even though
 * the content is fine — the raw text rides on the error).
 */
import type { z } from 'zod'
import { generateText } from '@vismay/ai-gateway'

/** Try to recover a schema-valid object from a failed generateObject call. */
export function salvageStructured<S extends z.ZodType>(e: unknown, schema: S): z.infer<S> | null {
  const text = (e as { text?: unknown } | null)?.text
  if (typeof text !== 'string') return null
  const candidates: unknown[] = []
  try {
    candidates.push(JSON.parse(text))
  } catch {
    return null
  }
  const first = candidates[0]
  if (first && typeof first === 'object') {
    // Double-wrap: some top-level value is itself a stringified JSON payload.
    for (const v of Object.values(first as Record<string, unknown>)) {
      if (typeof v !== 'string') continue
      try {
        const inner: unknown = JSON.parse(v)
        candidates.push(inner)
        if (inner && typeof inner === 'object') candidates.push({ ...(first as object), ...(inner as object) })
      } catch {
        // not JSON — ignore
      }
    }
  }
  for (const cand of candidates) {
    const parsed = schema.safeParse(cand)
    if (parsed.success) return parsed.data
  }
  return null
}

export async function generateStructured<S extends z.ZodType>(
  opts: {
    model: string
    system?: string
    prompt: string
    schema: S
    temperature?: number
    metadata?: Record<string, string>
  },
  attempts = 2
): Promise<{ result: z.infer<S>; modelUsed: string }> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await generateText(opts)
      return { result: res.result as z.infer<S>, modelUsed: res.modelUsed }
    } catch (e) {
      lastErr = e
      const salvaged = salvageStructured(e, opts.schema)
      if (salvaged != null) {
        const modelUsed = (e as { response?: { modelId?: string } }).response?.modelId ?? opts.model
        return { result: salvaged, modelUsed }
      }
    }
  }
  throw lastErr
}
