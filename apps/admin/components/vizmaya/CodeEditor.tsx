'use client'

import { useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import type { editor as MonacoEditor, IRange, MarkerSeverity } from 'monaco-editor'
import type { Monaco, OnMount } from '@monaco-editor/react'
import { installMonacoWorkers, configureMonacoLanguages } from './setupMonaco'

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
}: Props) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)

  const handleMount: OnMount = useCallback(
    (editorInstance, monaco) => {
      editorRef.current = editorInstance

      // Disable Monaco's default Cmd/Ctrl+S — the global handler in
      // EditorClient / ChartEditorClient already saves at the window level,
      // and Monaco's stock binding pops a "Save File" command that does nothing.
      editorInstance.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => {
          /* no-op — handled at window level */
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
    [onValidate, onReady],
  )

  const handleBeforeMount = useCallback((monaco: Monaco) => {
    configureMonacoLanguages(monaco)
  }, [])

  return (
    <div className="flex-1 min-h-0 w-full bg-neutral-950">
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
    </div>
  )
}
