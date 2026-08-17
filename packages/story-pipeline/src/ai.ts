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

/** Map a pipeline text alias to the Anthropic model id for the direct path. */
function anthropicModelId(alias: string): string {
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
 * comparisons stay apples-to-apples. The SDK's `zodOutputFormat` is zod-v4-only;
 * our schemas are zod v3, so we convert with zod-to-json-schema (inlining `$ref`s
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
  const tools: Anthropic.Tool[] = [
    { name: 'emit', description: 'Return the structured result.', input_schema },
  ]
  const emitOnce = async (
    messages: Anthropic.MessageParam[],
  ): Promise<{ block: Anthropic.ToolUseBlock; message: Anthropic.Message }> => {
    const message = await getAnthropic().messages.create({
      model,
      max_tokens: 16000,
      system: opts.system,
      messages,
      tools,
      tool_choice: { type: 'tool', name: 'emit' },
    })
    const block = message.content.find((b) => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') {
      throw new Error(
        `anthropic-direct (${model}): no tool_use in reply — stop_reason=${message.stop_reason}` +
          (message.stop_reason === 'max_tokens' ? ' (raise max_tokens)' : ''),
      )
    }
    return { block, message }
  }

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: opts.prompt }]
  const first = await emitOnce(messages)
  const parsed = opts.schema.safeParse(first.block.input)
  if (parsed.success) return parsed.data

  // Forced tool use is not schema-strict: the model occasionally deviates
  // (e.g. a string where an array is required). The gateway path retries on
  // any failure; mirror that here with ONE corrective turn that feeds the
  // validation issues back through a tool_result.
  const issues = parsed.error.issues
    .slice(0, 8)
    .map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n')
  const second = await emitOnce([
    ...messages,
    { role: 'assistant', content: [first.block] },
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: first.block.id,
          is_error: true,
          content:
            `Your input failed schema validation:\n${issues}\n\n` +
            'Call emit again with a corrected input that satisfies the schema exactly.',
        },
      ],
    },
  ])
  const retried = opts.schema.safeParse(second.block.input)
  if (retried.success) return retried.data
  throw new Error(
    `anthropic-direct (${model}): output failed schema validation after corrective retry — ` +
      retried.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; '),
  )
}

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
