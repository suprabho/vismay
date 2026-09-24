import { generateText } from '@vismay/ai-gateway'
import Anthropic from '@anthropic-ai/sdk'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { z } from 'zod'
import { DEFAULT_TEXT_MODEL } from './models'

// ── Direct-to-Anthropic path (bypasses the AI gateway) ─────────────────────
//
// Opt in with STORY_PIPELINE_ANTHROPIC_DIRECT=1 (and ANTHROPIC_API_KEY set):
// every structured call then hits api.anthropic.com directly, using its own
// quota instead of the shared gateway budget. Only Claude models are reachable
// this way; the pipeline default (`text.claude`) maps to Sonnet 5 so the
// output matches the gateway path it replaces. Production (the gateway) is
// untouched — this is for offline harnesses and quota-bound eval runs.
// STORY_PIPELINE_ANTHROPIC_MODEL optionally pins the exact model id.

/**
 * Map a pipeline text alias to the Anthropic model id for the direct path.
 * STORY_PIPELINE_ANTHROPIC_MODEL pins every direct call to one exact model id
 * (e.g. `claude-opus-5-5`) regardless of the per-feature alias — for batch runs
 * on a model the gateway aliases don't expose.
 */
function anthropicModelId(alias: string): string {
  const pinned = process.env.STORY_PIPELINE_ANTHROPIC_MODEL?.trim()
  if (pinned) return pinned
  if (alias === 'text.fable') return 'claude-fable-5'
  if (alias === 'text.opus') return 'claude-opus-4-8'
  return 'claude-sonnet-5' // text.claude (the default) and any other alias
}

function useAnthropicDirect(): boolean {
  return process.env.STORY_PIPELINE_ANTHROPIC_DIRECT === '1' && !!process.env.ANTHROPIC_API_KEY
}

let anthropicClient: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic() // reads ANTHROPIC_API_KEY
  return anthropicClient
}

/**
 * Structured generation straight through the official Anthropic SDK, via
 * TOOL-CALLING: a single forced tool whose `input_schema` IS the target schema.
 * That's how Claude reliably satisfies the section body's discriminated unions
 * (the same mechanism the gateway's `generateObject` uses) — and forcing the
 * tool also keeps thinking off, matching the gateway baseline so eval
 * comparisons stay apples-to-apples. Models that reject forced tool use
 * (Opus 5.5, Fable 5.1, Mythos 5.1) get `tool_choice: auto` plus an explicit
 * instruction instead, with thinking on (it can't be disabled there).
 * The SDK's `zodOutputFormat` is zod-v4-only; our schemas are zod v3, so we convert with zod-to-json-schema (inlining `$ref`s
 * so the tool gets a top-level object schema) and re-validate the reply with zod.
 */
async function generateStructuredDirect<S extends z.ZodType>(opts: {
  model?: string
  system: string
  prompt: string
  schema: S
}): Promise<z.infer<S>> {
  const model = anthropicModelId(opts.model || DEFAULT_TEXT_MODEL)
  const input_schema = zodToJsonSchema(opts.schema, {
    $refStrategy: 'none',
  }) as Anthropic.Tool.InputSchema
  const forced = !NO_FORCED_TOOL_MODELS.has(model)
  // Models that reject forced tool use get `auto` + an explicit instruction,
  // and a retry when a reply comes back without the call.
  const attempts = forced ? 1 : 2
  let lastStop: string | null = null
  for (let attempt = 1; attempt <= attempts; attempt++) {
    // Streamed + finalMessage(): the SDK refuses long non-streaming requests at
    // this max_tokens, and the result is the same Message either way.
    const message = await getAnthropic().messages.stream({
      model,
      // Headroom for the adaptive thinking these models always run, which
      // shares the output budget with the tool call.
      max_tokens: forced ? 16000 : 32000,
      system: forced ? opts.system : `${opts.system}\n\n${EMIT_INSTRUCTION}`,
      messages: [{ role: 'user', content: opts.prompt }],
      tools: [{ name: 'emit', description: 'Return the structured result.', input_schema }],
      tool_choice: forced ? { type: 'tool', name: 'emit' } : { type: 'auto' },
    }, { timeout: DIRECT_TIMEOUT_MS }).finalMessage()
    const block = message.content.find((b) => b.type === 'tool_use')
    if (block && block.type === 'tool_use') {
      const first = opts.schema.safeParse(block.input)
      if (first.success) return first.data
      // Without a forced tool the model occasionally emits a nested object as
      // a JSON *string*; decode those and validate once more before failing.
      return opts.schema.parse(decodeStringifiedJson(block.input))
    }
    lastStop = message.stop_reason
    if (message.stop_reason === 'refusal' || message.stop_reason === 'max_tokens') break
  }
  throw new Error(
    `anthropic-direct (${model}): no tool_use in reply — stop_reason=${lastStop}` +
      (lastStop === 'max_tokens' ? ' (raise max_tokens)' : ''),
  )
}

/** Per-request ceiling: a dropped stream otherwise hangs the caller forever. */
const DIRECT_TIMEOUT_MS = 8 * 60 * 1000

/** Replace string values that are themselves a JSON object/array with the parsed value. */
function decodeStringifiedJson(value: unknown): unknown {
  if (typeof value === 'string') {
    const t = value.trim()
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try {
        return decodeStringifiedJson(JSON.parse(t))
      } catch {
        return value
      }
    }
    return value
  }
  if (Array.isArray(value)) return value.map(decodeStringifiedJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decodeStringifiedJson(v)]))
  }
  return value
}

/** Models that 400 on a forced `tool_choice` (`any` / `tool`). */
const NO_FORCED_TOOL_MODELS = new Set(['claude-opus-5-5', 'claude-fable-5-1', 'claude-mythos-5-1'])

const EMIT_INSTRUCTION =
  'Return your answer by calling the `emit` tool exactly once, with the complete result as its ' +
  'input. Do not answer in plain text.'

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
  if (useAnthropicDirect()) return generateStructuredDirect(opts)
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
