import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { generateText } from '@vismay/ai-gateway'
import { buildAssistantSystemPrompt } from '@/lib/assistantKnowledge'

/**
 * Vizmaya platform Q&A assistant.
 *
 * Answers authors' "how does X work / what does Y accept" questions, grounded in
 * the knowledge pack (platform overview + live slot/layer schemas) assembled by
 * `buildAssistantSystemPrompt`. Read-only: it explains the platform, it does not
 * act on stories.
 *
 * `generateText` takes a single system + prompt (no messages array), so the chat
 * history is flattened into a transcript and the model continues it.
 */

// DeepSeek V4 Flash — ~20x cheaper than Sonnet. The assistant is grounded in a
// knowledge pack (schemas + platform overview), so a cheap reasoner is enough;
// swap back to 'text.claude' if answer quality regresses.
const MODEL = 'text.deepseek'
const MAX_MESSAGES = 24
const MAX_CONTENT_LENGTH = 4000

const MAX_CONTEXT_VALUE = 3000
const MAX_SELECTION = 2000

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface RequestContext {
  selectedText?: string
  node?: { label?: string; kind?: string; layerType?: string; value?: string }
  section?: { slug?: string; index?: number; id?: string; kind?: string; heading?: string }
  editorSelection?: string
}

interface AssistantBody {
  messages: ChatMessage[]
  context?: RequestContext
}

/** Render the attached context as a block prepended to the conversation. */
function renderContext(ctx: RequestContext | undefined): string {
  if (!ctx) return ''
  const lines: string[] = []
  if (ctx.section) {
    const s = ctx.section
    const label = [
      s.heading ? `"${s.heading}"` : null,
      s.kind ? `kind ${s.kind}` : null,
    ]
      .filter(Boolean)
      .join(', ')
    lines.push(
      `Story: ${s.slug ?? '?'} · section ${typeof s.index === 'number' ? s.index + 1 : '?'}${label ? ` (${label})` : ''}`,
    )
  }
  if (ctx.node) {
    const n = ctx.node
    const head = [n.label, n.kind ? `kind ${n.kind}` : null, n.layerType]
      .filter(Boolean)
      .join(' · ')
    lines.push(`Focused node: ${head || 'unknown'}. Its current value:`)
    lines.push('```')
    lines.push((n.value ?? '').slice(0, MAX_CONTEXT_VALUE))
    lines.push('```')
  }
  const sel = (ctx.editorSelection || ctx.selectedText || '').trim()
  if (sel) lines.push(`Selected text: "${sel.slice(0, MAX_SELECTION)}"`)

  if (!lines.length) return ''
  return `## Current context (what the author is looking at)\n${lines.join('\n')}`
}

export async function POST(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: AssistantBody
  try {
    body = (await req.json()) as AssistantBody
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }

  const messages = Array.isArray(body.messages) ? body.messages : []
  const clean = messages
    .filter(
      (m): m is ChatMessage =>
        !!m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0,
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({
      role: m.role,
      content: m.content.trim().slice(0, MAX_CONTENT_LENGTH),
    }))

  if (!clean.length || clean[clean.length - 1].role !== 'user') {
    return NextResponse.json(
      { error: 'messages must be a non-empty list ending in a user turn' },
      { status: 400 },
    )
  }

  // Flatten the conversation into a transcript the model continues. A context
  // block (the slot/section the author is looking at) is prepended so the model
  // can resolve "this/here".
  const contextBlock = renderContext(body.context)
  const transcript =
    (contextBlock ? `${contextBlock}\n\n` : '') +
    clean
      .map((m) => `${m.role === 'user' ? 'Author' : 'Assistant'}: ${m.content}`)
      .join('\n\n') +
    '\n\nAssistant:'

  const system = contextBlock
    ? `${buildAssistantSystemPrompt()}\n\nWhen the author says "this", "here", ` +
      `"this layer/section", or similar, they mean the CURRENT CONTEXT block at ` +
      `the top of the conversation.`
    : buildAssistantSystemPrompt()

  let answer: string
  let modelUsed: string
  try {
    const out = await generateText({
      model: MODEL,
      system,
      prompt: transcript,
      metadata: { feature: 'admin-assistant' },
    })
    answer = out.result
    modelUsed = out.modelUsed
  } catch (e) {
    return NextResponse.json(
      {
        error: `assistant failed: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true, answer, model: modelUsed })
}
