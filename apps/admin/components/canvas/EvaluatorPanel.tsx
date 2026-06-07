'use client'

/**
 * Evaluator panel (Feature 3, step 3).
 *
 * Runs the `evaluate` route for the active section — which screenshots the
 * rendered frame and critiques it with a vision model — and lists the
 * aspect-keyed critiques. Each critique routes back to the slot that fixes it:
 * "Fix in ✨" opens that slot's prompt bar (via `onSendToPrompt`), and the
 * suggested prompt is shown for the author to reuse.
 *
 * Self-contained so it doesn't touch the PromptBar / generate wiring: it only
 * fetches + renders, and hands the chosen aspect back to the canvas host.
 */

import { useEffect, useState } from 'react'

interface Critique {
  aspect: string
  severity: 'low' | 'medium' | 'high'
  issue: string
  suggestedPrompt: string
  suggestedValue?: string
}

interface EvalResult {
  critiques: Critique[]
  notes: string
}

interface Props {
  slug: string
  sectionId: string
  /** Section config YAML, sent as context for the critique. */
  sectionConfig?: string
  /** Open the ✨ prompt bar for the critique's aspect (with its suggested fix). */
  onSendToPrompt: (aspect: string, suggestedPrompt: string) => void
  onClose: () => void
}

const SEVERITY_COLOR: Record<Critique['severity'], string> = {
  high: '#f87171',
  medium: '#e8a04f',
  low: '#9bb0d8',
}

export default function EvaluatorPanel({
  slug,
  sectionId,
  sectionConfig,
  onSendToPrompt,
  onClose,
}: Props) {
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<EvalResult | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/stories/${encodeURIComponent(slug)}/canvas/evaluate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sectionId, config: sectionConfig }),
          },
        )
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          critiques?: Critique[]
          notes?: string
          error?: string
        }
        if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        if (!cancelled) {
          setResult({ critiques: body.critiques ?? [], notes: body.notes ?? '' })
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Evaluation failed.')
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [slug, sectionId, sectionConfig])

  return (
    <div
      style={{
        position: 'absolute',
        top: 64,
        left: 16,
        width: 440,
        maxHeight: 'calc(100vh - 96px)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 60,
        background: '#0c0c0c',
        border: '1px solid #2a2a2a',
        borderRadius: 8,
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 14px',
          borderBottom: '1px solid #1f1f1f',
        }}
      >
        <span style={{ fontSize: 12, color: '#ddd' }}>
          ✦ Evaluate section
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            marginLeft: 'auto',
            color: '#888',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 15,
          }}
        >
          ×
        </button>
      </div>

      <div style={{ overflowY: 'auto', padding: 14 }}>
        {busy && (
          <div style={{ fontSize: 12, color: '#888' }}>
            Rendering & evaluating this section…
          </div>
        )}
        {error && (
          <div style={{ color: '#f87171', fontSize: 11 }}>{error}</div>
        )}

        {result && !busy && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {result.notes && (
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  lineHeight: 1.55,
                  color: '#bbb',
                }}
              >
                {result.notes}
              </p>
            )}

            {result.critiques.length === 0 ? (
              <div style={{ fontSize: 12, color: '#7bbf8a' }}>
                No issues flagged — this section reads well.
              </div>
            ) : (
              result.critiques.map((c, i) => (
                <div
                  key={i}
                  style={{
                    border: '1px solid #1f1f1f',
                    borderRadius: 6,
                    padding: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 9,
                      letterSpacing: '0.12em',
                    }}
                  >
                    <span style={{ color: '#999', textTransform: 'uppercase' }}>
                      {c.aspect}
                    </span>
                    <span
                      style={{
                        color: SEVERITY_COLOR[c.severity] ?? '#999',
                        textTransform: 'uppercase',
                      }}
                    >
                      {c.severity}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.5 }}>
                    {c.issue}
                  </div>
                  {c.suggestedPrompt && (
                    <div
                      style={{
                        fontSize: 11,
                        color: '#9a9a9a',
                        lineHeight: 1.5,
                        fontStyle: 'italic',
                      }}
                    >
                      Suggested: {c.suggestedPrompt}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    <button
                      type="button"
                      onClick={() => onSendToPrompt(c.aspect, c.suggestedPrompt)}
                      style={{
                        background: 'transparent',
                        color: '#c79bd8',
                        border: '1px solid #5a2a8f',
                        borderRadius: 5,
                        padding: '4px 10px',
                        fontSize: 11,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Fix in ✨ {c.aspect}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
