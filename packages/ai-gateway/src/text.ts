import { generateText as aiGenerateText, generateObject as aiGenerateObject } from 'ai'
import type { z } from 'zod'
import { getGatewayClient } from './client'
import { resolveModel, type TextModelAlias } from './models'

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
  const model = gateway(modelId)

  if (opts.schema) {
    const res = await aiGenerateObject({
      model,
      system: opts.system,
      prompt: opts.prompt,
      schema: opts.schema,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
      headers: opts.metadata,
    })
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: res.object as any,
      modelUsed: modelId,
      usage: normaliseUsage(res.usage),
    }
  }

  const res = await aiGenerateText({
    model,
    system: opts.system,
    prompt: opts.prompt,
    temperature: opts.temperature,
    maxOutputTokens: opts.maxOutputTokens,
    headers: opts.metadata,
  })
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result: res.text as any,
    modelUsed: modelId,
    usage: normaliseUsage(res.usage),
  }
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
