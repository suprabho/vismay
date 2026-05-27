'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { editor as MonacoEditorNs } from 'monaco-editor'
import type { OnMount } from '@monaco-editor/react'
import type { EditableSlice } from './canvasEditing'

// Monaco needs `window` — keep it out of the SSR bundle. The canvas page
// is already 'use client' but dynamic import here avoids a hydration race
// on first mount (the canvas client iframe-mounts before Monaco settles).
const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then((m) => m.default),
  { ssr: false }
)

interface Props {
  slice: EditableSlice
  saving: boolean
  error: string | null
  onSave: (text: string) => void
  onClose: () => void
  /** Optional handler for the "Map-Edit" header button. When defined, the
   *  panel shows a button that drops the user into the visual MapPickerModal
   *  scoped to whatever camera fields this slice owns (a background-layer
   *  map, an autoplay map override, a per-section share map). The panel
   *  itself doesn't know which — it just relays the click. */
  onMapEdit?: () => void
}

/**
 * Right-side editor panel. Slides over the canvas (doesn't cover it
 * fully) so iframe updates after save remain visible. Monaco for YAML
 * (folding, validation, etc.); plaintext mode for narration scripts.
 *
 * Cmd/Ctrl+S → save. Esc → close (only when not dirty; otherwise
 * confirms; spike scope keeps it simple — just save before closing).
 */
export default function EditorPanel({
  slice,
  saving,
  error,
  onSave,
  onClose,
  onMapEdit,
}: Props) {
  // Local draft so the editor is responsive without round-tripping
  // through React state on every keystroke. Initialised from the slice;
  // resets when the slice identity changes (different node clicked).
  const [draft, setDraft] = useState(slice.text)
  const sliceTitleRef = useRef(slice.title)
  useEffect(() => {
    if (sliceTitleRef.current !== slice.title) {
      sliceTitleRef.current = slice.title
      setDraft(slice.text)
    }
  }, [slice.title, slice.text])

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      onSave(draft)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  // Register alternative find/replace keybindings. Monaco's defaults
  // (Cmd+F / Cmd+H) lose to Chrome's "Find on Page" and macOS's system-level
  // "Hide Application" respectively; the latter can't be intercepted by a
  // web app at all. Cmd+Opt+F / Cmd+Opt+H avoid both.
  const editorRef = useRef<MonacoEditorNs.IStandaloneCodeEditor | null>(null)
  const handleMount: OnMount = useCallback((editorInstance, monaco) => {
    editorRef.current = editorInstance
    editorInstance.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
      () => {
        editorInstance.getAction('actions.find')?.run()
      },
    )
    editorInstance.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyH,
      () => {
        editorInstance.getAction('editor.action.startFindReplaceAction')?.run()
      },
    )
  }, [])

  const openFind = () => {
    editorRef.current?.focus()
    editorRef.current?.getAction('actions.find')?.run()
  }

  const dirty = draft !== slice.text

  return (
    <div
      onKeyDown={onKey}
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
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: '#fff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {slice.title}
            {dirty && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 10,
                  color: '#aaa',
                  fontWeight: 400,
                }}
              >
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
            {slice.language === 'yaml' ? 'YAML' : 'Text'}
            <span style={{ marginLeft: 10 }}>⌘⌥F find · ⌘S save · esc close</span>
          </div>
        </div>
        <button
          onClick={openFind}
          title="Find / Replace (⌘⌥F / ⌘⌥H)"
          style={{
            background: 'transparent',
            color: '#888',
            border: '1px solid #2a2a2a',
            borderRadius: 5,
            padding: '6px 10px',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Find
        </button>
        {onMapEdit && (
          <button
            onClick={onMapEdit}
            title="Open the visual map editor for this slice"
            style={{
              background: 'transparent',
              color: '#ddd',
              border: '1px solid #3a5da0',
              borderRadius: 5,
              padding: '6px 10px',
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            🗺 Map-Edit
          </button>
        )}
        <button
          onClick={() => onSave(draft)}
          disabled={saving || !dirty}
          style={{
            background: dirty ? '#2a4d8f' : '#1a1a1a',
            color: dirty ? '#fff' : '#555',
            border: `1px solid ${dirty ? '#3a5da0' : '#2a2a2a'}`,
            borderRadius: 5,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 500,
            cursor: !dirty || saving ? 'default' : 'pointer',
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
            lineHeight: 1,
          }}
          title="Close (esc)"
        >
          ×
        </button>
      </header>

      {error && (
        <div
          style={{
            padding: '10px 16px',
            background: '#3a1a1a',
            color: '#ff8a8a',
            fontSize: 12,
            borderBottom: '1px solid #4a2a2a',
            whiteSpace: 'pre-wrap',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <MonacoEditor
          value={draft}
          language={slice.language}
          theme="vs-dark"
          onChange={(v) => setDraft(v ?? '')}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: 'off',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            renderWhitespace: 'selection',
            // Empty-state hint — shown only while the editor is blank.
            placeholder: slice.placeholder,
          }}
          loading={
            <div
              style={{
                padding: 16,
                fontSize: 12,
                color: '#666',
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              }}
            >
              loading editor…
            </div>
          }
        />
      </div>
    </div>
  )
}
