'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { editor as MonacoEditorNs } from 'monaco-editor'
import type { OnMount } from '@monaco-editor/react'
import type { EditableSlice } from './canvasEditing'
import PromptBar from './PromptBar'
import type { AiSlotKind } from './aiSlots'
import { setAssistantEditorSelection } from '@/lib/assistantContext'
import SelectionAiOverlay from './SelectionAiOverlay'
import type { SelectionLanguage } from './aiSelectionActions'
import { useIsMobile } from './useIsMobile'

/** Map a slice's Monaco language to the selection-overlay's language buckets. */
function selectionLanguage(language: string): SelectionLanguage {
  if (language === 'yaml') return 'yaml'
  if (language === 'markdown') return 'markdown'
  if (language === 'json') return 'json'
  return 'plaintext'
}

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
  /** Story slug — required to surface the AI prompt input. */
  slug?: string
  /** When set (with `slug`), shows a `<PromptBar>` above the editor scoped to
   *  this slot. The generated value lands in the editor draft for review; the
   *  existing Save flow persists it. Left unset → no prompt input. */
  aiKind?: AiSlotKind
  /** Layer type for `aiKind === 'layer'` (routes image layers to image gen). */
  aiLayerType?: string
  /** The section this slot belongs to (indexes config.sections). Forwarded to
   *  the AI surfaces so the generation/edit is grounded in the live story
   *  context for that section. */
  aiParentIndex?: number
  aiSubIndex?: number
  /** Footshorts (fs:*) story. When true, the panel hides the AI generate
   *  (`PromptBar`) + "✨ Ask AI" (`SelectionAiOverlay`) surfaces and offers a
   *  "+ Football data" button instead (requires `onAddFootballData`). */
  isFootshorts?: boolean
  /** Opens the football-data picker — the footshorts replacement for the AI
   *  generate/ask surfaces. */
  onAddFootballData?: () => void
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
  slug,
  aiKind,
  aiLayerType,
  aiParentIndex,
  aiSubIndex,
  isFootshorts,
  onAddFootballData,
}: Props) {
  // Local draft so the editor is responsive without round-tripping
  // through React state on every keystroke. Initialised from the slice;
  // resets when the slice identity changes (different node clicked).
  // Also adopts external slice.text changes — e.g. the visual Map-Edit
  // picker writing to the same file while this panel stays open — but
  // only when the user has no unsaved edits we'd clobber. Without this,
  // saving over a stale draft would silently overwrite the picker's
  // just-applied YAML.
  const isMobile = useIsMobile()
  const [draft, setDraft] = useState(slice.text)
  const sliceTitleRef = useRef(slice.title)
  const sliceTextRef = useRef(slice.text)
  useEffect(() => {
    if (sliceTitleRef.current !== slice.title) {
      sliceTitleRef.current = slice.title
      sliceTextRef.current = slice.text
      setDraft(slice.text)
      return
    }
    if (sliceTextRef.current !== slice.text) {
      // Same node, slice.text changed externally. Adopt iff the user's
      // current draft still matches the previous slice.text (i.e. no
      // unsaved local edits); otherwise leave their draft alone so a
      // background write doesn't eat in-flight typing.
      const prev = sliceTextRef.current
      sliceTextRef.current = slice.text
      setDraft((current) => (current === prev ? slice.text : current))
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
  // Editor instance as state (not just the ref) so the selection-AI overlay can
  // mount with a live instance — reading a ref during render is disallowed.
  const [monacoEditor, setMonacoEditor] =
    useState<MonacoEditorNs.IStandaloneCodeEditor | null>(null)
  const handleMount: OnMount = useCallback((editorInstance, monaco) => {
    editorRef.current = editorInstance
    setMonacoEditor(editorInstance)
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
    // Publish the editor's selection to the ✨ Ask context channel — Monaco's
    // selection lives in its own model, invisible to window.getSelection().
    editorInstance.onDidChangeCursorSelection(() => {
      const sel = editorInstance.getSelection()
      const text = sel ? (editorInstance.getModel()?.getValueInRange(sel) ?? '') : ''
      setAssistantEditorSelection(text)
    })
  }, [])

  // Clear the published selection when this editor unmounts.
  useEffect(() => () => setAssistantEditorSelection(''), [])

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
        left: isMobile ? 0 : undefined,
        width: isMobile ? '100%' : 'min(560px, 45vw)',
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

      {isFootshorts ? (
        // Footshorts (fs:*) stories don't generate layers with AI — they pull
        // real data. The AI generate panel is replaced by the football-data
        // picker, which drops real fs:* layers into the current section.
        onAddFootballData && (
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid #2a2a2a',
            }}
          >
            <button
              type="button"
              onClick={onAddFootballData}
              title="Add a real standings table, match card, timeline, or bracket from footshorts data"
              style={{
                width: '100%',
                background: 'transparent',
                color: '#5fd38a',
                border: '1px solid #2a8f55',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              + 🏟️ Football data
            </button>
          </div>
        )
      ) : (
        slug &&
        aiKind && (
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid #2a2a2a',
            }}
          >
            {/* Generated value lands in the draft; the user reviews it in Monaco
                and the existing Save flow persists it through mergeSlice. */}
            <PromptBar
              slug={slug}
              kind={aiKind}
              layerType={aiLayerType}
              parentIndex={aiParentIndex}
              subIndex={aiSubIndex}
              currentValue={draft}
              onApply={(v) => setDraft(v)}
            />
          </div>
        )
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
        {/* "✨ Ask AI" is hidden for footshorts (fs:*) stories — they author
            from real data, not AI. */}
        {monacoEditor && !isFootshorts && (
          <SelectionAiOverlay
            editor={monacoEditor}
            language={selectionLanguage(slice.language)}
            slug={slug}
            kind={aiKind}
            layerType={aiLayerType}
            parentIndex={aiParentIndex}
            subIndex={aiSubIndex}
          />
        )}
      </div>
    </div>
  )
}
