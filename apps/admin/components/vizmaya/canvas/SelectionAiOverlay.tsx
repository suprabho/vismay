'use client'

/**
 * Floating "✨ Ask AI" affordance for a text selection inside a Monaco editor.
 *
 * Mounted as a sibling of the editor inside its (position: relative) container,
 * given the mounted editor instance. It:
 *   - watches the selection; when there's a non-empty one, shows a small ✨
 *     trigger anchored above it, and registers an "✨ Ask AI…" entry in Monaco's
 *     right-click menu (both triggers open the same popover);
 *   - the popover offers section-aware presets (`aiSelectionActions.ts`) plus a
 *     free-form box, split two ways:
 *       • **edit** → POSTs the selection + instruction to `canvas/transform`,
 *         then shows an Accept/Reject preview; Accept replaces the range in the
 *         editor (the host's onChange picks it up into the normal save flow).
 *       • **ask**  → opens the ✨ Ask panel seeded with the question; the
 *         selection rides along as context.
 *
 * Self-contained: it reads/writes only the editor it's handed and the assistant
 * context channel, so the same component works in EditorPanel (markdown/yaml)
 * and the shared CodeEditor (json).
 */

import { useEffect, useRef, useState } from 'react'
import type { editor as MonacoEditorNs, IRange } from 'monaco-editor'
import {
  selectionActions,
  type SelectionAction,
  type SelectionLanguage,
} from './aiSelectionActions'
import {
  openAssistant,
  setAssistantEditorSelection,
} from '@/lib/assistantContext'

interface Anchor {
  top: number
  left: number
  height: number
}

interface Props {
  editor: MonacoEditorNs.IStandaloneCodeEditor | null
  language: SelectionLanguage
  /** Story slug — required for the edit-in-place transform call. */
  slug?: string
  /** Slot identity, when known — sharpens presets + the transform model set. */
  kind?: string
  layerType?: string
}

/** Minimum selected chars before the trigger appears (ignore stray clicks). */
const MIN_SELECTION = 2

export default function SelectionAiOverlay({
  editor,
  language,
  slug,
  kind,
  layerType,
}: Props) {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<{ range: IRange; text: string } | null>(
    null,
  )
  const [view, setView] = useState<'menu' | 'preview'>('menu')
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const actions = selectionActions(language, kind, layerType)
  const editActions = actions.filter((a) => a.mode === 'edit')
  const askActions = actions.filter((a) => a.mode === 'ask')

  /* ── Selection tracking ─────────────────────────────────────────── */

  // Recompute the trigger anchor from the live selection. Refs hold the latest
  // closures so the Monaco listeners (registered once) never see stale state.
  const refreshAnchor = () => {
    if (!editor) return
    const sel = editor.getSelection()
    const text =
      sel && !sel.isEmpty() ? (editor.getModel()?.getValueInRange(sel) ?? '') : ''
    if (text.trim().length < MIN_SELECTION) {
      setAnchor(null)
      setOpen(false)
      return
    }
    const pos = editor.getScrolledVisiblePosition(sel!.getStartPosition())
    if (!pos) {
      setAnchor(null)
      return
    }
    setAnchor({ top: pos.top, left: pos.left, height: pos.height })
  }

  const openMenu = () => {
    if (!editor) return
    const sel = editor.getSelection()
    const text =
      sel && !sel.isEmpty() ? (editor.getModel()?.getValueInRange(sel) ?? '') : ''
    if (!sel || text.trim().length < MIN_SELECTION) return
    setActive({ range: sel, text })
    setError(null)
    setPreview(null)
    setInstruction('')
    setView('menu')
    setOpen(true)
    const pos = editor.getScrolledVisiblePosition(sel.getStartPosition())
    if (pos) setAnchor({ top: pos.top, left: pos.left, height: pos.height })
  }

  // Keep the Monaco-listener callbacks pointed at the latest closures (so they
  // see current state) without re-registering the listeners every render.
  const refreshRef = useRef(refreshAnchor)
  const openMenuRef = useRef(openMenu)
  useEffect(() => {
    refreshRef.current = refreshAnchor
    openMenuRef.current = openMenu
  })

  useEffect(() => {
    if (!editor) return
    const d1 = editor.onDidChangeCursorSelection(() => refreshRef.current())
    const d2 = editor.onDidScrollChange(() => refreshRef.current())
    const action = editor.addAction({
      id: 'vismay.askAiSelection',
      label: '✨ Ask AI…',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 0,
      precondition: 'editorHasSelection',
      run: () => openMenuRef.current(),
    })
    refreshRef.current()
    return () => {
      d1.dispose()
      d2.dispose()
      action.dispose()
    }
  }, [editor])

  // Close the popover on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        editor?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, editor])

  /* ── Actions ────────────────────────────────────────────────────── */

  async function runEdit(instructionText: string) {
    const text = instructionText.trim()
    if (!text || !active) return
    if (!slug) {
      setError('Editing is unavailable here (no story context).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/vizmaya/stories/${encodeURIComponent(slug)}/canvas/transform`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language,
            selection: active.text,
            instruction: text,
            kind,
            layerType,
          }),
        },
      )
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        value?: string
        error?: string
      }
      if (!res.ok || !body.ok || typeof body.value !== 'string') {
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setPreview(body.value)
      setView('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Edit failed.')
    } finally {
      setBusy(false)
    }
  }

  function runAsk(question: string) {
    const q = question.trim()
    if (!q || !active) return
    // Make sure the selection is on the context channel (CodeEditor doesn't
    // publish it the way EditorPanel does), then open the panel with the question.
    setAssistantEditorSelection(active.text)
    openAssistant({ prompt: q, autoSend: true })
    setOpen(false)
  }

  function acceptPreview() {
    if (!editor || !active || preview === null) return
    editor.executeEdits('vismay.askAiSelection', [
      { range: active.range, text: preview, forceMoveMarkers: true },
    ])
    editor.focus()
    setOpen(false)
  }

  /* ── Render ─────────────────────────────────────────────────────── */

  if (!editor || !anchor) return null

  const triggerTop = Math.max(2, anchor.top - 26)
  const popoverTop = anchor.top + anchor.height + 6
  const left = Math.max(4, anchor.left)

  return (
    <>
      {!open && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openMenu}
          style={{ top: triggerTop, left }}
          className="absolute z-20 flex items-center gap-1 rounded-md border border-white/15 bg-neutral-900/90 px-2 py-1 text-[11px] text-neutral-200 shadow-lg backdrop-blur-sm hover:bg-neutral-800"
          title="Ask AI about the selection"
        >
          ✨ Ask AI
        </button>
      )}

      {open && (
        <div
          ref={popoverRef}
          style={{ top: popoverTop, left, width: 320, maxWidth: '90%' }}
          className="absolute z-30 rounded-lg border border-white/15 bg-neutral-950/95 p-2.5 text-neutral-200 shadow-2xl backdrop-blur-sm"
        >
          {view === 'menu' && (
            <div className="space-y-2.5">
              {editActions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {editActions.map((a) => (
                    <PresetButton
                      key={a.id}
                      action={a}
                      disabled={busy}
                      onClick={() => void runEdit(a.text)}
                    />
                  ))}
                </div>
              )}

              {askActions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-600">
                    Ask
                  </span>
                  {askActions.map((a) => (
                    <PresetButton
                      key={a.id}
                      action={a}
                      disabled={busy}
                      onClick={() => runAsk(a.text)}
                    />
                  ))}
                </div>
              )}

              <div className="border-t border-white/10 pt-2">
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  disabled={busy}
                  rows={2}
                  placeholder="Tell AI what to change, or ask a question…"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void runEdit(instruction)
                    }
                  }}
                  className="w-full resize-none rounded border border-white/10 bg-neutral-900 p-2 text-[12px] leading-relaxed text-neutral-100 focus:border-white/30 focus:outline-none disabled:opacity-40"
                />
                <div className="mt-1.5 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void runEdit(instruction)}
                    disabled={busy || !instruction.trim()}
                    className="rounded bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-950 disabled:opacity-40"
                  >
                    {busy ? 'Working…' : '✏️ Edit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => runAsk(instruction)}
                    disabled={busy || !instruction.trim()}
                    className="rounded border border-white/15 px-2.5 py-1 text-[11px] text-neutral-200 hover:bg-white/10 disabled:opacity-40"
                  >
                    💬 Ask
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      editor.focus()
                    }}
                    className="ml-auto text-[11px] text-neutral-500 hover:text-white"
                  >
                    Close
                  </button>
                </div>
              </div>

              {error && <div className="text-[11px] text-red-400">{error}</div>}
            </div>
          )}

          {view === 'preview' && preview !== null && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                AI suggestion — replaces your selection
              </div>
              <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded border border-white/10 bg-neutral-900 p-2 text-[11px] leading-relaxed text-neutral-100">
                {preview}
              </pre>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={acceptPreview}
                  className="rounded bg-emerald-500 px-2.5 py-1 text-[11px] font-medium text-neutral-950 hover:bg-emerald-400"
                >
                  ✓ Accept
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreview(null)
                    setView('menu')
                  }}
                  className="rounded border border-white/15 px-2.5 py-1 text-[11px] text-neutral-200 hover:bg-white/10"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    editor.focus()
                  }}
                  className="ml-auto text-[11px] text-neutral-500 hover:text-white"
                >
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function PresetButton({
  action,
  disabled,
  onClick,
}: {
  action: SelectionAction
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={action.text}
      className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-neutral-200 hover:border-white/30 hover:bg-white/10 disabled:opacity-40"
    >
      {action.label}
    </button>
  )
}
