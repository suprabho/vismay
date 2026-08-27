'use client'

/**
 * Platform Q&A assistant — a header "Ask" button that opens a full-screen chat.
 *
 * Authors ask how the platform works ("how do I add a map layer?", "what does
 * deltaColor accept?") and get answers grounded in the knowledge pack
 * (platform overview + live slot schemas) served by `/api/vizmaya/assistant`.
 * Read-only: it explains, it doesn't act on stories.
 *
 * The panel is a full-screen opaque overlay (not a translucent side drawer) so
 * nothing from the editor behind it — toolbar, Save bar — bleeds through.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  getAssistantContext,
  registerAssistantOpener,
  capValue,
  type AssistantNodeContext,
  type AssistantSectionContext,
} from '@/lib/assistantContext'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Context attached to the conversation, captured when the panel opens. */
interface Attached {
  node?: AssistantNodeContext
  section?: AssistantSectionContext
  selectedText?: string
}

/** A row in the history list (no message bodies — those load on open). */
interface ConversationSummary {
  id: string
  title: string
  story_slug: string | null
  updated_at: string
}

const EXAMPLES = [
  'How do I add a map layer to a section?',
  'What fields does a bigStat layer accept?',
  'What’s the difference between a deck and a map story?',
  'How do share-card overrides work?',
]

/** Models offered in the Ask picker — keep in sync with ASSISTANT_MODELS. */
const ASK_MODELS: { value: string; label: string }[] = [
  { value: 'text.deepseek', label: 'DeepSeek · cheap' },
  { value: 'text.fast', label: 'Gemini Flash' },
  { value: 'text.pro', label: 'Gemini Pro' },
  { value: 'text.claude', label: 'Claude Sonnet' },
  { value: 'text.opus', label: 'Claude Opus' },
  { value: 'text.fable', label: 'Claude Fable · frontier' },
  { value: 'text.grok', label: 'Grok 4.5 · fast' },
]

/** A removable context chip shown above the composer. */
function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-neutral-300">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="text-neutral-500 hover:text-white"
        aria-label={`Remove ${label}`}
      >
        ✕
      </button>
    </span>
  )
}

export default function AssistantLauncher() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [context, setContext] = useState<Attached>({})
  const [model, setModel] = useState('text.deepseek')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [history, setHistory] = useState<ConversationSummary[]>([])
  const [view, setView] = useState<'chat' | 'history'>('chat')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Portal target is only available on the client (one-time mount flag).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])

  // Capture ambient context at the moment of opening — the text the author has
  // selected (window or the code editor) and what the canvas is focused on —
  // BEFORE the panel grabs focus and clears the window selection.
  function captureContext(): Attached {
    const winSel = (window.getSelection?.()?.toString() ?? '').trim()
    const ctx = getAssistantContext()
    const selected = (ctx?.editorSelection || winSel || '').trim()
    return {
      node: ctx?.node,
      section: ctx?.section,
      selectedText: selected ? capValue(selected) : undefined,
    }
  }

  function handleOpen() {
    setContext(captureContext())
    setView('chat')
    setOpen(true)
    void loadHistory()
  }

  /** Refresh the history list. Non-critical — failures are swallowed. */
  async function loadHistory() {
    try {
      const res = await fetch('/api/vizmaya/assistant/conversations')
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        conversations?: ConversationSummary[]
      }
      if (res.ok && body.ok) setHistory(body.conversations ?? [])
    } catch {
      /* history is a convenience; don't surface load errors */
    }
  }

  /** Start a fresh conversation — the next send creates a new server record. */
  function newChat() {
    setMessages([])
    setConversationId(null)
    setError(null)
    setView('chat')
  }

  /** Rehydrate a past conversation's full thread into the panel. */
  async function loadConversation(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/vizmaya/assistant/conversations/${id}`)
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        messages?: ChatMessage[]
      }
      if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setMessages(
        (body.messages ?? []).map((m) => ({ role: m.role, content: m.content })),
      )
      setConversationId(id)
      setContext({})
      setView('chat')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load conversation.')
    } finally {
      setBusy(false)
    }
  }

  /** Delete a conversation; drop it from the list and reset if it was open. */
  async function deleteConversation(id: string) {
    try {
      await fetch(`/api/vizmaya/assistant/conversations/${id}`, {
        method: 'DELETE',
      })
    } catch {
      /* optimistic — remove locally regardless */
    }
    setHistory((h) => h.filter((c) => c.id !== id))
    if (conversationId === id) newChat()
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, busy])

  // Esc closes the panel; lock body scroll while it's open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  /**
   * Send a question. `opts` lets a programmatic caller (the selection menu's
   * "Ask AI") send against a fresh thread with explicitly captured context,
   * sidestepping the async state set by `handleOpen` in the same tick.
   */
  async function send(
    text: string,
    opts?: {
      context?: Attached
      baseMessages?: ChatMessage[]
      conversationId?: string | null
    },
  ) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setError(null)
    const base = opts?.baseMessages ?? messages
    const ctx = opts?.context ?? context
    const convId =
      opts && 'conversationId' in opts ? opts.conversationId : conversationId
    const next = [...base, { role: 'user' as const, content: trimmed }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const hasContext = ctx.node || ctx.section || ctx.selectedText
      const res = await fetch('/api/vizmaya/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          context: hasContext ? ctx : undefined,
          conversationId: convId ?? undefined,
          model,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        answer?: string
        error?: string
        conversationId?: string
      }
      if (!res.ok || !body.ok || typeof body.answer !== 'string') {
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setMessages((m) => [...m, { role: 'assistant', content: body.answer! }])
      if (typeof body.conversationId === 'string') {
        setConversationId(body.conversationId)
      }
      // Surface the new/updated thread (and its derived title) in the list.
      void loadHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assistant failed.')
    } finally {
      setBusy(false)
    }
  }

  // Expose an open handler so other surfaces (the editor selection menu) can
  // open the panel — optionally seeding and auto-sending a question against a
  // fresh thread.
  const openProgrammatically = (opts?: {
    prompt?: string
    autoSend?: boolean
  }) => {
    const attached = captureContext()
    setMessages([])
    setConversationId(null)
    setError(null)
    setContext(attached)
    setView('chat')
    setOpen(true)
    void loadHistory()
    const prompt = opts?.prompt?.trim()
    if (prompt && opts?.autoSend !== false) {
      void send(prompt, {
        context: attached,
        baseMessages: [],
        conversationId: null,
      })
    } else if (prompt) {
      setInput(prompt)
    }
  }
  // A ref keeps the registered callback bound to the latest closure (so it sees
  // current state) without re-registering on every render. Assigned in an
  // effect — refs must not be written during render.
  const openRef = useRef(openProgrammatically)
  useEffect(() => {
    openRef.current = openProgrammatically
  })
  useEffect(() => registerAssistantOpener((opts) => openRef.current(opts)), [])

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="text-neutral-400 hover:text-white transition-colors"
        title="Ask about the platform"
      >
        ✨ Ask
      </button>

      {open &&
        mounted &&
        createPortal(
          <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-white/10 bg-neutral-950 text-neutral-100 shadow-2xl">
          {/* Header */}
          <div className="shrink-0 border-b border-white/10 bg-neutral-950">
            <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-3">
              <span className="text-sm font-medium">✨ Platform assistant</span>
              <div className="ml-auto flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setView((v) => (v === 'history' ? 'chat' : 'history'))
                  }
                  className={
                    'text-[11px] hover:text-white ' +
                    (view === 'history' ? 'text-white' : 'text-neutral-500')
                  }
                >
                  History
                </button>
                {(messages.length > 0 || conversationId) && (
                  <button
                    type="button"
                    onClick={newChat}
                    className="text-[11px] text-neutral-500 hover:text-white"
                  >
                    ＋ New
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded px-2 py-0.5 text-sm text-neutral-400 hover:bg-white/10 hover:text-white"
                  aria-label="Close assistant"
                >
                  Close ✕
                </button>
              </div>
            </div>
          </div>

          {/* History */}
          {view === 'history' && (
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl px-4 py-4">
                {history.length === 0 ? (
                  <p className="pt-6 text-sm text-neutral-500">
                    No past conversations yet.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {history.map((c) => (
                      <li
                        key={c.id}
                        className={
                          'group flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/5 ' +
                          (c.id === conversationId ? 'bg-white/5' : '')
                        }
                      >
                        <button
                          type="button"
                          onClick={() => void loadConversation(c.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block truncate text-[13px] text-neutral-200">
                            {c.title}
                          </span>
                          {c.story_slug && (
                            <span className="block truncate text-[11px] text-neutral-600">
                              {c.story_slug}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteConversation(c.id)}
                          className="shrink-0 text-neutral-600 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
                          aria-label={`Delete "${c.title}"`}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Thread */}
          {view === 'chat' && (
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
              {messages.length === 0 && (
                <div className="space-y-4 pt-6">
                  <p className="text-sm text-neutral-400">
                    Ask anything about authoring on Vizmaya — sections, layers,
                    themes, share overrides. Answers come from the platform docs
                    and the live slot schemas.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {EXAMPLES.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => send(q)}
                        className="rounded-lg border border-white/10 px-3 py-2.5 text-left text-[13px] text-neutral-300 hover:border-white/30 hover:bg-white/5"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === 'user' ? 'flex justify-end' : 'flex justify-start'
                  }
                >
                  <div
                    className={
                      'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ' +
                      (m.role === 'user'
                        ? 'bg-white text-neutral-950'
                        : 'border border-white/10 bg-neutral-900 text-neutral-200')
                    }
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {busy && (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-white/10 bg-neutral-900 px-4 py-2.5 text-sm text-neutral-500">
                    Thinking…
                  </div>
                </div>
              )}

              {error && <div className="text-xs text-red-400">{error}</div>}
            </div>
          </div>
          )}

          {/* Composer */}
          {view === 'chat' && (
          <div className="shrink-0 border-t border-white/10 bg-neutral-950">
            <div className="mx-auto w-full max-w-3xl px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
              {(context.node || context.section || context.selectedText) && (
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-600">
                    Context
                  </span>
                  {context.section && (
                    <Chip
                      label={`Section ${(context.section.index ?? 0) + 1}`}
                      onRemove={() =>
                        setContext((c) => ({ ...c, section: undefined }))
                      }
                    />
                  )}
                  {context.node && (
                    <Chip
                      label={
                        (context.node.label || context.node.kind) +
                        (context.node.layerType
                          ? ` · ${context.node.layerType}`
                          : '')
                      }
                      onRemove={() =>
                        setContext((c) => ({ ...c, node: undefined }))
                      }
                    />
                  )}
                  {context.selectedText && (
                    <Chip
                      label={`Selected text (${context.selectedText.length})`}
                      onRemove={() =>
                        setContext((c) => ({ ...c, selectedText: undefined }))
                      }
                    />
                  )}
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void send(input)
                    }
                  }}
                  disabled={busy}
                  rows={2}
                  placeholder="Ask about the platform…  (Enter to send, Shift+Enter for newline)"
                  className="min-h-[44px] flex-1 resize-none rounded-lg border border-white/10 bg-neutral-900 p-2.5 text-sm text-neutral-100 focus:border-white/30 focus:outline-none disabled:opacity-40"
                />
                <button
                  type="button"
                  onClick={() => void send(input)}
                  disabled={busy || !input.trim()}
                  className="h-[44px] shrink-0 rounded-lg bg-white px-4 text-sm font-medium text-neutral-950 disabled:opacity-40"
                >
                  Send
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] text-neutral-500">Model</span>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={busy}
                  className="rounded border border-white/10 bg-neutral-900 px-2 py-1 text-[12px] text-neutral-300 focus:border-white/30 focus:outline-none disabled:opacity-40"
                >
                  {ASK_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          )}
        </div>
          </>,
          document.body,
        )}
    </>
  )
}
