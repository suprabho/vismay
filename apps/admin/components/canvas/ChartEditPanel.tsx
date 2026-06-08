'use client'

/**
 * Right-side panel for editing ONE chart's DATA on the canvas. Mirrors
 * ThemeEditOverlay's geometry (slides over the canvas without covering it) so
 * the frame iframe behind it stays visible after a save.
 *
 * The chart's data lives in the `chart_data` store, keyed by (slug, chartId) —
 * NOT in config.yaml. So this panel reads/writes via the chart route
 * (`GET/PUT /api/stories/<slug>/charts/<id>`), independent of the config-slot
 * save path. The ✨ Generate/Regenerate button calls the source-grounded
 * `generateChart` pass (`POST …/charts/<id>/generate`) and previews the result
 * in the editor; the author saves explicitly.
 *
 * The persisted shape is the renderer's chart-data contract:
 *   { steps: [{ title?, option: EChartsOption }] }
 */

import { useEffect, useState } from 'react'
import CodeEditor, { type CodeEditorMarker } from '@/components/vizmaya/CodeEditor'

interface Props {
  slug: string
  chartId: string
  /** Save in flight (owned by the parent's slot-save state). */
  saving: boolean
  /** Save error (owned by the parent). */
  error: string | null
  onSave: (raw: string) => void
  onClose: () => void
}

const EMPTY_TEMPLATE = '{\n  "steps": [\n    { "option": {} }\n  ]\n}\n'

export default function ChartEditPanel({
  slug,
  chartId,
  saving,
  error,
  onSave,
  onClose,
}: Props) {
  const [value, setValue] = useState('')
  const [baseline, setBaseline] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // True once the chart has data on disk — switches Generate → Regenerate and
  // sends the note as a refine `feedback` rather than a fresh `requirement`.
  const [hasData, setHasData] = useState(false)
  const [markers, setMarkers] = useState<CodeEditorMarker[]>([])
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  // A note for the data pass: what to plot (first run) or a refine instruction
  // (regenerate). Optional for compose drafts — the planned requirement is used.
  const [note, setNote] = useState('')

  const dirty = value !== baseline
  const hasErrors = markers.some((m) => m.severity === 'error')

  // Load the chart's current data on open. The parent passes `key={chartId}`,
  // so this remounts per chart — `loading`/`loadError` start at their initial
  // values and we only set them from inside the async callback (avoids the
  // cascading-render lint on synchronous setState in an effect body).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `/api/stories/${encodeURIComponent(slug)}/charts/${encodeURIComponent(chartId)}`,
          { cache: 'no-store' }
        )
        if (cancelled) return
        if (res.ok) {
          const json = (await res.json()) as { data?: unknown }
          const text = json.data != null ? JSON.stringify(json.data, null, 2) : EMPTY_TEMPLATE
          setValue(text)
          setBaseline(text)
          setHasData(json.data != null)
        } else if (res.status === 404) {
          setValue(EMPTY_TEMPLATE)
          setBaseline(EMPTY_TEMPLATE)
          setHasData(false)
        } else {
          const err = await res.json().catch(() => null)
          setLoadError(err?.error ?? `Load failed (${res.status})`)
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Load failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, chartId])

  async function generate() {
    if (generating) return
    setGenerating(true)
    setGenError(null)
    try {
      const trimmed = note.trim()
      const body = hasData
        ? trimmed
          ? { feedback: trimmed }
          : {}
        : trimmed
          ? { requirement: trimmed }
          : {}
      const res = await fetch(
        `/api/stories/${encodeURIComponent(slug)}/charts/${encodeURIComponent(chartId)}/generate`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setGenError(json?.error ?? `Generation failed (${res.status})`)
        return
      }
      if (json?.data != null) {
        setValue(JSON.stringify(json.data, null, 2))
        setNote('')
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      if (dirty && !hasErrors && !saving) onSave(value)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      onKeyDown={onKey}
      tabIndex={-1}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(560px, 45vw)',
        background: '#0e0e0e',
        borderLeft: '1px solid #2a2a2a',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <header
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #2a2a2a',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>
            Chart Data
            {dirty && (
              <span style={{ marginLeft: 8, fontSize: 10, color: '#aaa', fontWeight: 400 }}>
                · unsaved
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 10,
              color: '#666',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginTop: 2,
            }}
          >
            {chartId}.json
            <span style={{ marginLeft: 10 }}>⌘S save · esc close</span>
          </div>
        </div>
        <button
          onClick={() => onSave(value)}
          disabled={saving || !dirty || hasErrors}
          style={{
            background: dirty && !hasErrors ? '#2a4d8f' : '#1a1a1a',
            color: dirty && !hasErrors ? '#fff' : '#555',
            border: `1px solid ${dirty && !hasErrors ? '#3a5da0' : '#2a2a2a'}`,
            borderRadius: 5,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 500,
            cursor: !dirty || hasErrors || saving ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            color: '#888',
            border: '1px solid #2a2a2a',
            borderRadius: 5,
            padding: '6px 10px',
            fontSize: 14,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ✕
        </button>
      </header>

      {/* Generate / Regenerate — source-grounded chart data. */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #1f1f1f', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            hasData
              ? 'Refine note (optional) — e.g. "use 2020–2024 only"'
              : 'What to plot (optional for compose drafts)…'
          }
          style={{
            background: '#161616',
            border: '1px solid #2a2a2a',
            borderRadius: 5,
            padding: '6px 10px',
            fontSize: 12,
            color: '#ddd',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={generate}
          disabled={generating}
          style={{
            alignSelf: 'flex-start',
            background: '#1a1a1a',
            color: generating ? '#666' : '#cfe',
            border: '1px solid #2a3a4a',
            borderRadius: 5,
            padding: '6px 12px',
            fontSize: 12,
            cursor: generating ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {generating ? 'Generating…' : hasData ? '✨ Regenerate data' : '✨ Generate data'}
        </button>
        {genError && (
          <div style={{ fontSize: 11, color: '#f88' }}>{genError}</div>
        )}
      </div>

      {(error || loadError) && (
        <div style={{ padding: '8px 16px', fontSize: 11, color: '#f88', borderBottom: '1px solid #1f1f1f' }}>
          {error ?? loadError}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        {loading ? (
          <div style={{ padding: 16, fontSize: 12, color: '#666' }}>Loading chart data…</div>
        ) : (
          <CodeEditor
            value={value}
            onChange={setValue}
            language="json"
            path={`${chartId}.json`}
            onValidate={setMarkers}
            ai={{ slug, kind: 'chartData', chartId }}
          />
        )}
      </div>
    </div>
  )
}
