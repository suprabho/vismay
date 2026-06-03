'use client'

/**
 * Platform Q&A assistant — a header "Ask" button that opens a chat drawer.
 *
 * Authors ask how the platform works ("how do I add a map layer?", "what does
 * deltaColor accept?") and get answers grounded in the knowledge pack
 * (platform overview + live slot schemas) served by `/api/vizmaya/assistant`.
 * Read-only: it explains, it doesn't act on stories.
 */

import { useEffect, useRef, useState } from 'react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const EXAMPLES = [
  'How do I add a map layer to a section?',
  'What fields does a bigStat layer accept?',
  'What’s the difference between a deck and a map story?',
  'How do share-card overrides work?',
]

export default function AssistantLauncher() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, busy])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setError(null)
    const next = [...messages, { role: 'user' as const, content: trimmed }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const res = await fetch('/api/vizmaya/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        answer?: string
        error?: string
      }
      if (!res.ok || !body.ok || typeof body.answer !== 'string') {
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setMessages((m) => [...m, { role: 'assistant', content: body.answer! }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assistant failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-neutral-400 hover:text-white transition-colors"
        title="Ask about the platform"
      >
        ✨ Ask
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-neutral-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
              <span className="text-sm font-medium">✨ Platform assistant</span>
              <div className="ml-auto flex items-center gap-2">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setMessages([])
                      setError(null)
                    }}
                    className="text-[11px] text-neutral-500 hover:text-white"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-neutral-500 hover:text-white"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-neutral-400">
                    Ask anything about authoring on Vizmaya — sections, layers,
                    themes, share overrides. Answers come from the platform docs
                    and the live slot schemas.
                  </p>
                  <div className="space-y-1.5">
                    {EXAMPLES.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => send(q)}
                        className="block w-full rounded border border-white/10 px-2.5 py-1.5 text-left text-[12px] text-neutral-300 hover:border-white/30 hover:bg-white/5"
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
                      'max-w-[88%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[12.5px] leading-relaxed ' +
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
                  <div className="rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-[12px] text-neutral-500">
                    Thinking…
                  </div>
                </div>
              )}

              {error && (
                <div className="text-[11px] text-red-400">{error}</div>
              )}
            </div>

            <div className="shrink-0 border-t border-white/10 p-3">
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
                placeholder="Ask about the platform…  (Enter to send)"
                className="w-full resize-none rounded border border-white/10 bg-neutral-900 p-2 text-[12.5px] text-neutral-100 focus:border-white/30 focus:outline-none disabled:opacity-40"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => void send(input)}
                  disabled={busy || !input.trim()}
                  className="rounded bg-white px-3 py-1.5 text-xs text-neutral-950 disabled:opacity-40"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
