'use client'

import { useMemo, useRef, useState } from 'react'
import { buildYamlModel, type YamlModel } from '@vismay/content-source/yamlSections'
import CodeEditor, { type CodeEditorApi, type CodeEditorMarker } from './CodeEditor'
import MapPickerModal from './MapPickerModal'

interface Props {
  value: string
  onChange: (next: string) => void
  path: string
  onValidate?: (markers: CodeEditorMarker[]) => void
  /** Forwarded to CodeEditor to enable the ✨ "Ask AI" selection overlay. */
  ai?: { slug?: string; kind?: string; layerType?: string }
}

interface MapPickerTarget {
  startLine: number
  endLine: number
  sectionRaw: string
  label: string
}

export default function YamlConfigEditor({ value, onChange, path, onValidate, ai }: Props) {
  const apiRef = useRef<CodeEditorApi | null>(null)
  const [picker, setPicker] = useState<MapPickerTarget | null>(null)

  // Build the section model from the latest value so the "insert location"
  // button can locate the section under the cursor.
  const model: YamlModel = useMemo(() => buildYamlModel(value), [value])

  function openMapPicker() {
    const api = apiRef.current
    if (!api) return
    const cursor = api.getCursorLine() // 1-based
    const cursor0 = cursor - 1 // 0-based for SectionBlock comparisons
    const section = model.sections.find(
      (s) => cursor0 >= s.startLine && cursor0 < s.endLine,
    )
    if (!section) {
      alert('Place the cursor inside a section (the "- id: …" block) before opening the map picker.')
      return
    }
    setPicker({
      // Monaco line ranges are 1-based and inclusive — bump by 1.
      startLine: section.startLine + 1,
      endLine: section.endLine, // SectionBlock.endLine is exclusive 0-based ⇒ inclusive 1-based of the last line consumed
      sectionRaw: section.raw,
      label: `${section.id ?? '(no id)'}${section.kind ? ` · ${section.kind}` : ''}`,
    })
  }

  function applyPicker(nextSectionRaw: string) {
    if (!picker) return
    apiRef.current?.replaceLineRange(picker.startLine, picker.endLine, nextSectionRaw)
    setPicker(null)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
        <button
          type="button"
          onClick={openMapPicker}
          className="text-xs px-2.5 py-1 rounded text-neutral-300 bg-white/5 hover:bg-white/10 border border-white/10"
          title="Visually pick map center/zoom/pitch/bearing for the section at the cursor"
        >
          📍 Pick map view
        </button>
        <div className="text-xs text-neutral-500 ml-auto truncate">
          {model.sections.length} section{model.sections.length === 1 ? '' : 's'}
          {model.parseError && <span className="text-amber-400 ml-2">parse error</span>}
        </div>
      </div>

      <CodeEditor
        value={value}
        onChange={onChange}
        language="yaml"
        path={path}
        onValidate={onValidate}
        onReady={(api) => {
          apiRef.current = api
        }}
        ai={ai}
      />

      {picker && (
        <MapPickerModal
          sectionRaw={picker.sectionRaw}
          sectionLabel={picker.label}
          onApply={applyPicker}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}
