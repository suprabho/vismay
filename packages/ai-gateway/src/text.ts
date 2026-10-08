import {
  generateText as aiGenerateText,
  generateObject as aiGenerateObject,
  stepCountIs,
  type ModelMessage,
  type ToolSet,
} from 'ai'
import type { z } from 'zod'
import { getGatewayClient } from './client'
import { resolveModel, fallbackModel, type TextModelAlias } from './models'

/** An image attached to a vision request — raw base64 data + its mime type. */
export interface GenerateImageInput {
  data: string
  mimeType: string
}

/**
 * A document attached to a request — raw base64 data + its mime type (e.g.
 * `application/pdf`). Claude reads PDFs natively, text layer and page images
 * both, so scanned documents don't need a separate OCR pass.
 */
export interface GenerateFileInput {
  data: string
  mimeType: string
  filename?: string
}

export interface GenerateTextOptions<S extends z.ZodType | undefined = undefined> {
  /** Alias from MODELS.text (preferred) or a raw gateway id. */
  model: TextModelAlias | string
  /** System message — defines voice, constraints, output shape. */
  system?: string
  /** User message — the actual task input. */
  prompt: string
  /**
   * Optional images for vision models (Claude / GPT). When set, the prompt +
   * images are sent as a single multimodal user message instead of a bare text
   * prompt. The chosen `model` must be vision-capable.
   */
  images?: GenerateImageInput[]
  /** Optional documents (PDFs) — sent in the same multimodal user message. */
  files?: GenerateFileInput[]
  /** Optional zod schema. When set, returns parsed `object` instead of `text`. */
  schema?: S
  temperature?: number
  maxOutputTokens?: number
  /**
   * Agentic tools the model may call (text mode only — not compatible with
   * `schema`). Define with the re-exported `tool()` helper. When set, the call
   * runs a multi-step loop (model → tool → model …) up to `maxSteps`.
   */
  tools?: ToolSet
  /** Max agentic steps when `tools` is set (default 1 = single tool round). */
  maxSteps?: number
  /** Forwarded to the gateway as headers — useful for tagging spend by feature. */
  metadata?: Record<string, string>
}

/**
 * Build the model input: a bare `prompt` string, or — when images or files are
 * present — a multimodal user `messages` array (text part, then one image part
 * per image, then one file part per document).
 */
function buildInput(
  prompt: string,
  images: GenerateImageInput[] | undefined,
  files: GenerateFileInput[] | undefined,
): { prompt: string } | { messages: ModelMessage[] } {
  if (!images?.length && !files?.length) return { prompt }
  return {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...(images ?? []).map((img) => ({
            type: 'image' as const,
            image: `data:${img.mimeType};base64,${img.data}`,
          })),
          ...(files ?? []).map((f) => ({
            type: 'file' as const,
            data: f.data,
            mediaType: f.mimeType,
            ...(f.filename ? { filename: f.filename } : {}),
          })),
        ],
      },
    ],
  }
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
 * tool-calling on Claude), not just by prompt instruction.
 */
export async function generateText<S extends z.ZodType | undefined = undefined>(
  opts: GenerateTextOptions<S>,
): Promise<GenerateTextResult<S extends z.ZodType ? z.infer<S> : string>> {
  const gateway = getGatewayClient()
  const modelId = resolveModel(opts.model)
  const input = buildInput(opts.prompt, opts.images, opts.files)

  if (opts.schema) {
    const { res, modelUsed } = await withModelFallback(modelId, (id) =>
      aiGenerateObject({
        model: gateway(id),
        system: opts.system,
        ...input,
        schema: opts.schema as z.ZodType,
        temperature: opts.temperature,
        maxOutputTokens: opts.maxOutputTokens,
        headers: opts.metadata,
        ...schemaProviderOptions(id),
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
      ...input,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
      headers: opts.metadata,
      ...(opts.tools ? { tools: opts.tools, stopWhen: stepCountIs(opts.maxSteps ?? 1) } : {}),
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
 * Claude 5.x thinks by default, and thinking tokens count against
 * `maxOutputTokens`. On a structured call with a tight budget the model can
 * spend all of it reasoning and return no object (finishReason `length`,
 * AI_NoObjectGeneratedError). Schema calls are extraction, not reasoning, so
 * turn thinking off for Anthropic models.
 */
function schemaProviderOptions(modelId: string) {
  if (!modelId.startsWith('anthropic/')) return {}
  return { providerOptions: { anthropic: { thinking: { type: 'disabled' as const } } } }
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
 * The AI SDK reports usage as `{ inputTokens, outputTokens, totalTokens }` with all
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
