'use client'

/**
 * Preview-then-apply AI repair for a schema mismatch.
 *
 * Wherever the admin flags a schema mismatch (an unknown layout, an
 * unregistered layer type, missing required fields), this panel offers the
 * one-click fix: on open it POSTs the broken YAML fragment + the detected
 * problems to `canvas/fix`, which returns corrected, schema-valid YAML. The
 * author sees a before→after preview and clicks **Apply** — the host owns
 * persistence (it splices the result back / routes it through the normal save),
 * so this component never touches the config files directly.
 *
 * Used by both mismatch surfaces: the Canvas node editor (region mismatch, in a
 * right-side panel) and the Deck composer (section mismatch, inline in the card).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { aiSlotConfig, type AiSlotKind } from './aiSlots'
import GenerationFeedback from './GenerationFeedback'

interface Props {
  slug: string
  kind: AiSlotKind
  layerType?: string
  /** The broken YAML to repair. Shown as the "before" half of the preview. */
  currentValue: string
  /** Machine-detected mismatch descriptions, surfaced to the author + the model. */
  problems: string[]
  /** Receives the corrected YAML when the author clicks Apply. */
  onApply: (value: string) => void
  onClose?: () => void
}

export default function FixPanel({
  slug,
  kind,
  layerType,
  currentValue,
  problems,
  onApply,
  onClose,
}: Props) {
  const config = aiSlotConfig(kind, layerType)
  // Starts true: the panel auto-runs the fix on mount, so the first render shows
  // the busy state — and run()'s opening setBusy(true) is then a no-op, so the
  // mount effect triggers no cascading render.
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [proposed, setProposed] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [generationId, setGenerationId] = useState<string | null>(null)

  const run = useCallback(async () => {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const res = await fetch(
        `/api/vizmaya/stories/${encodeURIComponent(slug)}/canvas/fix`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, layerType, fragment: currentValue, problems }),
        },
      )
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        value?: string
        generation?: { id?: string | null; model?: string; auditWarning?: string | null }
        error?: string
      }
      if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      if (typeof body.value !== 'string') throw new Error('no value returned')
      setProposed(body.value)
      setGenerationId(body.generation?.id ?? null)
      const served = body.generation?.model
      setNote(served ? `Proposed by ${served}.` : 'Proposed.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fix failed.')
    } finally {
      setBusy(false)
    }
  }, [slug, kind, layerType, currentValue, problems])

  // Auto-run the fix once on mount — the author already opted in by clicking
  // "Fix". The ref guard makes it fire exactly once (React StrictMode
  // double-invokes mount effects in dev, and a generation costs tokens). `busy`
  // starts true so run()'s opening setState is a no-op — the standard
  // "fetch on mount" pattern.
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void run()
  }, [run])

  return (
    <div className="border border-white/10 rounded bg-neutral-950/60">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-white/5">
        <span className="text-xs text-neutral-300">✨ Fix with AI · {config?.label ?? kind}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-[11px] text-neutral-500 hover:text-white px-1"
            aria-label="Close"
          >
            ×
          </button>
        )}
      </div>

      <div className="px-3 py-2.5 space-y-2">
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-neutral-600">
            Problems detected
          </div>
          <ul className="list-disc pl-4 text-[11px] text-amber-300/90 space-y-0.5">
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>

        {busy && <div className="text-[11px] text-neutral-400">Generating fix…</div>}
        {error && <div className="text-[11px] text-red-400">{error}</div>}

        {proposed !== null && (
          <div className="space-y-2">
            <details className="rounded border border-white/10 bg-neutral-900/50">
              <summary className="cursor-pointer select-none px-2 py-1 text-[10px] uppercase tracking-wider text-neutral-500">
                Before
              </summary>
              <pre className="max-h-48 overflow-auto px-2 py-1.5 text-[11px] leading-relaxed text-neutral-400 whitespace-pre-wrap">
                {currentValue}
              </pre>
            </details>
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-emerald-300/70">
                Proposed fix
              </div>
              <pre className="max-h-72 overflow-auto rounded border border-emerald-500/20 bg-neutral-900/50 px-2 py-1.5 text-[11px] leading-relaxed text-neutral-100 whitespace-pre-wrap">
                {proposed}
              </pre>
            </div>
            {note && <div className="text-[10px] text-emerald-300/70">{note}</div>}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy}
            className="text-[11px] px-2.5 py-1 rounded border border-white/10 text-neutral-200 hover:bg-white/10 disabled:opacity-40"
          >
            {proposed !== null ? 'Regenerate' : 'Retry'}
          </button>
          <button
            type="button"
            onClick={() => proposed !== null && onApply(proposed)}
            disabled={busy || proposed === null}
            className="ml-auto text-xs px-3 py-1.5 rounded bg-white text-neutral-950 disabled:opacity-40"
          >
            Apply fix
          </button>
        </div>

        {proposed !== null && (
          <GenerationFeedback slug={slug} generationId={generationId} />
        )}
      </div>
    </div>
  )
}
