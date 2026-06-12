import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { generateText } from '@vismay/ai-gateway'
import { buildAssistantSystemPrompt } from '@/lib/assistantKnowledge'
import { resolveStoryPack } from '@/lib/storyPack'
import { createServiceClient } from '@vismay/content-source/supabase'
import { getFeatureModel } from '@/lib/aiModelSettings'

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

// Models the Ask picker may choose from. DeepSeek (cheap, grounded) is the
// default; the others trade up for harder questions. Keep in sync with the
// dropdown in AssistantLauncher.
export const ASSISTANT_MODELS = [
  'text.deepseek',
  'text.fast',
  'text.pro',
  'text.claude',
] as const
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
  /** Existing conversation to append to; omit to start a new one. */
  conversationId?: string
  /** Model alias from ASSISTANT_MODELS; falls back to the default. */
  model?: string
}

const UUID_RE = /^[0-9a-f-]{36}$/i
const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/
/** Title shown in the history list — derived from the first user message. */
const TITLE_MAX = 80

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

  // Desk awareness: when the author is looking at a story, resolve its vertical
  // pack so the reference also documents that desk's layer types (fs:*, f1:*).
  // Best-effort — a resolution failure degrades to the canonical reference.
  const ctxSlug = body.context?.section?.slug
  const pack =
    typeof ctxSlug === 'string' && SAFE_SLUG.test(ctxSlug)
      ? await resolveStoryPack(ctxSlug).catch(() => null)
      : null

  const knowledge = buildAssistantSystemPrompt(pack)
  const system = contextBlock
    ? `${knowledge}\n\nWhen the author says "this", "here", ` +
      `"this layer/section", or similar, they mean the CURRENT CONTEXT block at ` +
      `the top of the conversation.`
    : knowledge

  let answer: string
  let modelUsed: string
  try {
    const model = (ASSISTANT_MODELS as readonly string[]).includes(
      body.model ?? '',
    )
      ? body.model!
      : await getFeatureModel('assistant')
    const out = await generateText({
      model,
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

  // Persist this turn (the new user message + the answer) so the thread can be
  // revisited from the history panel. A failed insert must not fail the request
  // — the author still gets their answer; persistence is best-effort.
  const lastUser = clean[clean.length - 1].content
  let conversationId = UUID_RE.test(body.conversationId ?? '')
    ? body.conversationId!
    : undefined
  let persistWarning: string | null = null
  try {
    conversationId = await persistTurn({
      conversationId,
      storySlug: body.context?.section?.slug,
      userContent: lastUser,
      userMeta: (body.context ?? {}) as Record<string, unknown>,
      answer,
      model: modelUsed,
    })
  } catch (e) {
    persistWarning = e instanceof Error ? e.message : 'failed to save conversation'
  }

  return NextResponse.json({
    ok: true,
    answer,
    model: modelUsed,
    conversationId,
    persistWarning,
  })
}

/**
 * Append a user turn + assistant answer to a conversation, creating the
 * conversation on first use. Returns the conversation id.
 */
async function persistTurn(args: {
  conversationId?: string
  storySlug?: string
  userContent: string
  userMeta: Record<string, unknown>
  answer: string
  model: string
}): Promise<string> {
  const supabase = createServiceClient()
  let { conversationId } = args

  if (!conversationId) {
    const title = args.userContent.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX)
    const { data, error } = await supabase
      .from('assistant_conversations')
      .insert({ title: title || 'New conversation', story_slug: args.storySlug ?? null })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    conversationId = data.id as string
  } else {
    await supabase
      .from('assistant_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)
  }

  const { error: msgErr } = await supabase.from('assistant_messages').insert([
    { conversation_id: conversationId, role: 'user', content: args.userContent, meta: args.userMeta },
    { conversation_id: conversationId, role: 'assistant', content: args.answer, meta: { model: args.model } },
  ])
  if (msgErr) throw new Error(msgErr.message)

  return conversationId
}
