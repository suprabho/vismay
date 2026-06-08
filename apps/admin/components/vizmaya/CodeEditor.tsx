'use client'

import { useCallback, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { editor as MonacoEditor, IRange, MarkerSeverity } from 'monaco-editor'
import type { Monaco, OnMount } from '@monaco-editor/react'
import { installMonacoWorkers, configureMonacoLanguages } from './setupMonaco'
import SelectionAiOverlay from '@/components/canvas/SelectionAiOverlay'

// Lazy-load the Monaco React wrapper. Workers must be wired before Monaco
// creates them, so `installMonacoWorkers()` runs here (loaded once, idempotent).
// Monaco itself is loaded by `@monaco-editor/react`'s default CDN loader —
// this matches the CDN-hosted YAML worker we register in `setupMonaco.ts`.
const Editor = dynamic(
  async () => {
    installMonacoWorkers()
    const mod = await import('@monaco-editor/react')
    return mod.Editor
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 min-h-0 w-full bg-neutral-950 text-neutral-500 text-sm p-4">
        Loading editor…
      </div>
    ),
  },
)

export interface CodeEditorMarker {
  severity: 'error' | 'warning' | 'info' | 'hint'
  message: string
  startLineNumber: number
  startColumn: number
}

export interface CodeEditorApi {
  /** 1-based line of the cursor (or 1 if no editor mounted). */
  getCursorLine: () => number
  /** Replace the inclusive 1-based [startLine, endLine] line range with `text`.
   *  Used by the YAML map-picker toolbar to splice an updated section back in. */
  replaceLineRange: (startLine: number, endLine: number, text: string) => void
}

interface Props {
  value: string
  onChange: (next: string) => void
  language: 'json' | 'yaml' | 'markdown'
  /** Logical file path. Drives schema association via the schema's fileMatch. */
  path: string
  readOnly?: boolean
  onValidate?: (markers: CodeEditorMarker[]) => void
  /** Receives an imperative API once the editor has mounted. */
  onReady?: (api: CodeEditorApi) => void
  /** When set, mounts the ✨ "Ask AI" selection overlay. `slug` is required for
   *  in-place edits; `kind`/`layerType` sharpen the presets when known.
   *  `parentIndex`/`subIndex`/`chartId` ground the edit in the live story
   *  (section context, the specific chart being edited). */
  ai?: {
    slug?: string
    kind?: string
    layerType?: string
    parentIndex?: number
    subIndex?: number
    chartId?: string
  }
}

const SEVERITY_TO_LABEL: Record<MarkerSeverity, CodeEditorMarker['severity']> = {
  1: 'hint',
  2: 'info',
  4: 'warning',
  8: 'error',
}

export default function CodeEditor({
  value,
  onChange,
  language,
  path,
  readOnly,
  onValidate,
  onReady,
  ai,
}: Props) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  // Editor instance as state (only when `ai` is on) so the selection overlay can
  // mount with a live instance — reading a ref during render is disallowed.
  const [aiEditor, setAiEditor] =
    useState<MonacoEditor.IStandaloneCodeEditor | null>(null)

  const handleMount: OnMount = useCallback(
    (editorInstance, monaco) => {
      editorRef.current = editorInstance
      if (ai) setAiEditor(editorInstance)

      // Disable Monaco's default Cmd/Ctrl+S — the global handler in
      // EditorClient / ChartEditorClient already saves at the window level,
      // and Monaco's stock binding pops a "Save File" command that does nothing.
      editorInstance.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => {
          /* no-op — handled at window level */
        },
      )

      // Alternative find/replace bindings. Monaco's defaults (Cmd+F / Cmd+H)
      // collide with the browser's "Find on Page" and macOS's system-level
      // "Hide Application" — the latter is unreachable from a web app at all.
      // Cmd+Opt+F / Cmd+Opt+H avoid both.
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

      if (onValidate) {
        const model = editorInstance.getModel()
        if (model) {
          const emit = () => {
            const markers: CodeEditorMarker[] = monaco.editor
              .getModelMarkers({ resource: model.uri })
              .map((m: MonacoEditor.IMarker) => ({
                severity: SEVERITY_TO_LABEL[m.severity] ?? 'info',
                message: m.message,
                startLineNumber: m.startLineNumber,
                startColumn: m.startColumn,
              }))
            onValidate(markers)
          }
          // Emit current markers (initial validation may have already run).
          emit()
          const sub = monaco.editor.onDidChangeMarkers(() => emit())
          model.onWillDispose(() => sub.dispose())
        }
      }

      if (onReady) {
        onReady({
          getCursorLine: () => editorInstance.getPosition()?.lineNumber ?? 1,
          replaceLineRange: (startLine, endLine, text) => {
            const model = editorInstance.getModel()
            if (!model) return
            const lastLine = model.getLineCount()
            const clampedEnd = Math.min(endLine, lastLine)
            const range: IRange = {
              startLineNumber: startLine,
              startColumn: 1,
              endLineNumber: clampedEnd,
              endColumn: model.getLineMaxColumn(clampedEnd),
            }
            editorInstance.executeEdits('vismay.replaceLineRange', [
              { range, text, forceMoveMarkers: true },
            ])
          },
        })
      }
    },
    [onValidate, onReady, ai],
  )

  const handleBeforeMount = useCallback((monaco: Monaco) => {
    configureMonacoLanguages(monaco)
  }, [])

  // Imperatively trigger Monaco's find/replace actions from the floating
  // toolbar. The editor ref may be null briefly while Monaco mounts; guard.
  const runFind = useCallback(() => {
    editorRef.current?.focus()
    editorRef.current?.getAction('actions.find')?.run()
  }, [])
  const runReplace = useCallback(() => {
    editorRef.current?.focus()
    editorRef.current?.getAction('editor.action.startFindReplaceAction')?.run()
  }, [])

  return (
    <div className="relative flex-1 min-h-0 w-full bg-neutral-950">
      {/* Floating find/replace controls. Monaco's own find widget renders
          at a higher z-index, so these visually disappear once a search is
          open and reappear when it's closed. */}
      <div className="pointer-events-none absolute top-1.5 right-3 z-10 flex gap-1">
        <button
          type="button"
          onClick={runFind}
          className="pointer-events-auto text-[11px] px-2 py-0.5 rounded text-neutral-400 bg-neutral-900/80 hover:bg-neutral-800 hover:text-neutral-200 border border-white/10 backdrop-blur-sm transition-colors"
          title="Find (⌘⌥F)"
        >
          Find
        </button>
        <button
          type="button"
          onClick={runReplace}
          className="pointer-events-auto text-[11px] px-2 py-0.5 rounded text-neutral-400 bg-neutral-900/80 hover:bg-neutral-800 hover:text-neutral-200 border border-white/10 backdrop-blur-sm transition-colors"
          title="Find & Replace (⌘⌥H)"
        >
          Replace
        </button>
      </div>
      <Editor
        value={value}
        onChange={(next) => onChange(next ?? '')}
        language={language}
        path={path}
        theme="vizmaya-dark"
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        options={{
          readOnly,
          tabSize: 2,
          insertSpaces: true,
          wordWrap: language === 'markdown' ? 'on' : 'off',
          folding: true,
          foldingStrategy: 'indentation',
          showFoldingControls: 'always',
          minimap: { enabled: false },
          lineNumbers: 'on',
          renderLineHighlight: 'line',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: 13,
          lineHeight: 1.6,
          smoothScrolling: true,
          padding: { top: 12, bottom: 12 },
          guides: { indentation: true, bracketPairs: true },
          bracketPairColorization: { enabled: true },
          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
        }}
      />
      {ai && aiEditor && (
        <SelectionAiOverlay
          editor={aiEditor}
          language={language}
          slug={ai.slug}
          kind={ai.kind}
          layerType={ai.layerType}
          parentIndex={ai.parentIndex}
          subIndex={ai.subIndex}
          chartId={ai.chartId}
        />
      )}
    </div>
  )
}
