import { generateText as aiGenerateText, generateObject as aiGenerateObject } from 'ai'
import type { z } from 'zod'
import { getGatewayClient } from './client'
import { resolveModel, fallbackModel, type TextModelAlias } from './models'

export interface GenerateTextOptions<S extends z.ZodType | undefined = undefined> {
  /** Alias from MODELS.text (preferred) or a raw gateway id. */
  model: TextModelAlias | string
  /** System message — defines voice, constraints, output shape. */
  system?: string
  /** User message — the actual task input. */
  prompt: string
  /** Optional zod schema. When set, returns parsed `object` instead of `text`. */
  schema?: S
  temperature?: number
  maxOutputTokens?: number
  /** Forwarded to the gateway as headers — useful for tagging spend by feature. */
  metadata?: Record<string, string>
}

export interface GenerateTextResult<T = string> {
  /** Parsed object when `schema` was passed; otherwise the raw text. */
  result: T
  /** Concrete model the gateway actually served the request from. */
  modelUsed: string
  /** Token usage as reported by the provider. Null on providers that don't report it. */
  usage: { input: number; output: number; total: number } | null
}

/**
 * Single entry point for all text generation. Routes through the Vercel AI
 * Gateway so the call site never imports a provider SDK directly.
 *
 * Pass a `schema` for typed JSON output — internally uses `generateObject` so
 * the model is constrained at the provider level (function calling on OpenAI,
 * structured output on Gemini), not just by prompt instruction.
 */
export async function generateText<S extends z.ZodType | undefined = undefined>(
  opts: GenerateTextOptions<S>,
): Promise<GenerateTextResult<S extends z.ZodType ? z.infer<S> : string>> {
  const gateway = getGatewayClient()
  const modelId = resolveModel(opts.model)

  if (opts.schema) {
    const { res, modelUsed } = await withModelFallback(modelId, (id) =>
      aiGenerateObject({
        model: gateway(id),
        system: opts.system,
        prompt: opts.prompt,
        schema: opts.schema as z.ZodType,
        temperature: opts.temperature,
        maxOutputTokens: opts.maxOutputTokens,
        headers: opts.metadata,
      }),
    )
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: res.object as any,
      modelUsed,
      usage: normaliseUsage(res.usage),
    }
  }

  const { res, modelUsed } = await withModelFallback(modelId, (id) =>
    aiGenerateText({
      model: gateway(id),
      system: opts.system,
      prompt: opts.prompt,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
      headers: opts.metadata,
    }),
  )
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result: res.text as any,
    modelUsed,
    usage: normaliseUsage(res.usage),
  }
}

/**
 * Run a generation against `modelId`; if it fails with a model-not-found error
 * and the id has a registered fallback, retry ONCE with the fallback. Returns
 * the result alongside the id that actually served it (so `modelUsed` reflects
 * reality after a fallback, not the requested id). Any other error propagates.
 */
async function withModelFallback<R>(
  modelId: string,
  run: (id: string) => Promise<R>,
): Promise<{ res: R; modelUsed: string }> {
  try {
    return { res: await run(modelId), modelUsed: modelId }
  } catch (err) {
    const fb = fallbackModel(modelId)
    if (fb && isModelNotFound(err)) {
      return { res: await run(fb), modelUsed: fb }
    }
    throw err
  }
}

/** Heuristic: did the gateway reject the request because the model id is unknown? */
function isModelNotFound(err: unknown): boolean {
  const status = (err as { statusCode?: number; status?: number })?.statusCode ??
    (err as { status?: number })?.status
  if (status === 404) return true
  const msg = err instanceof Error ? err.message : String(err)
  return /not[\s_-]?found|no such model|unknown model|model.*does not exist/i.test(msg)
}

/**
 * ai v5 reports usage as `{ inputTokens, outputTokens, totalTokens }` with all
 * three optional — providers that don't report token counts (some image models,
 * some streaming endpoints) leave them undefined. We re-shape into our stable
 * `{ input, output, total }` and collapse the all-undefined case to `null` so
 * downstream code can distinguish "no usage reported" from "0 tokens used".
 */
function normaliseUsage(
  usage:
    | {
        inputTokens?: number | undefined
        outputTokens?: number | undefined
        totalTokens?: number | undefined
      }
    | undefined,
): { input: number; output: number; total: number } | null {
  if (!usage) return null
  const input = usage.inputTokens
  const output = usage.outputTokens
  const total = usage.totalTokens
  if (input == null && output == null && total == null) return null
  return {
    input: input ?? 0,
    output: output ?? 0,
    total: total ?? (input ?? 0) + (output ?? 0),
  }
}
