'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import CodeEditor from '../../CodeEditor'
import type { MapData } from '../layers/types'

/**
 * Per-card map-content editor. Authors the map's `map:` block as YAML — center,
 * zoom, pins, regions (choropleth), heatmap, text labels. On Apply the parsed
 * object is stored on the map layer's `data` and takes precedence over the
 * story unit's resolved map (so a from-scratch map works, and a story map can
 * be overridden per card).
 */
const MAP_YAML_SCAFFOLD = `# Map content — mirrors a story's \`map:\` block.
center: [0, 20]
zoom: 1.6
pins:
  - coordinates: [-74.0, 40.71]
    label: New York
  - coordinates: [2.35, 48.85]
    label: Paris
# regions:        # choropleth fill (see story map docs)
#   source: world
#   items: { US: 0.8, FR: 0.5 }
# heatmap: { points: [[lng, lat, weight], ...] }
`

export function MapYamlDrawer({
  initial,
  onApply,
  onClose,
}: {
  initial?: MapData
  onApply: (data: MapData) => void
  onClose: () => void
}) {
  const [value, setValue] = useState<string>('')
  const [parseError, setParseError] = useState<string | null>(null)

  useEffect(() => {
    setValue(initial !== undefined ? stringifyYaml(initial) : MAP_YAML_SCAFFOLD)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const onChange = (next: string) => {
    setValue(next)
    try {
      parseYaml(next)
      setParseError(null)
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Invalid YAML')
    }
  }

  const apply = () => {
    let parsed: unknown
    try {
      parsed = parseYaml(value)
    } catch {
      setParseError('Invalid YAML — fix before applying.')
      return
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setParseError('Map data must be a YAML mapping (center / zoom / pins / …).')
      return
    }
    onApply(parsed as MapData)
    onClose()
  }

  const drawer = (
    <div className="fixed inset-0 z-[100] flex flex-col bg-neutral-950">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center text-xl leading-none text-neutral-400 hover:text-white"
          aria-label="Close"
        >
          ×
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-neutral-500">Edit map YAML</div>
          <div className="truncate text-sm">center · zoom · pins · regions · heatmap</div>
        </div>
        <button
          type="button"
          onClick={() => setValue(MAP_YAML_SCAFFOLD)}
          className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-neutral-200 hover:bg-white/10"
        >
          Reset to template
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={!!parseError || !value.trim()}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950 disabled:opacity-40"
        >
          Apply
        </button>
      </header>
      {parseError && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-1.5 text-[11px] text-red-300">{parseError}</div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        <CodeEditor value={value} onChange={onChange} language="yaml" path="share-card-map.yaml" />
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(drawer, document.body)
}
