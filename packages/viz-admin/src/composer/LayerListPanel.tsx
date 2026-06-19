'use client'

import type { ComposerLayer, ComposerSelection } from './types'
import { AddLayerPicker } from './AddLayerPicker'
import { labelCls, rowCls } from './styles'

/** The layer stack: add, select, reorder, show/hide, remove — plus a Background
 *  row when the host offers backgrounds. Array order 0 = top of the stack. */
export function LayerListPanel({
  layers,
  selection,
  addTypes,
  hasBackground,
  onAdd,
  onSelect,
  onMove,
  onRemove,
  onToggleVisible,
}: {
  layers: ComposerLayer[]
  selection: ComposerSelection
  addTypes: string[]
  hasBackground: boolean
  onAdd: (type: string) => void
  onSelect: (sel: ComposerSelection) => void
  onMove: (id: string, dir: 1 | -1) => void
  onRemove: (id: string) => void
  onToggleVisible: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className={labelCls}>Layers</span>
        <AddLayerPicker types={addTypes} onAdd={onAdd} />
      </div>

      <div className="flex flex-col gap-1">
        {layers.map((l, i) => {
          const selected = selection?.kind === 'layer' && selection.id === l.id
          return (
            <div
              key={l.id}
              className={`${rowCls} ${
                selected ? 'bg-white/10 text-neutral-100' : 'text-neutral-400 hover:bg-white/5'
              }`}
            >
              <button
                type="button"
                title={l.visible ? 'Hide' : 'Show'}
                className="opacity-70 hover:opacity-100"
                onClick={() => onToggleVisible(l.id)}
              >
                {l.visible ? '◉' : '○'}
              </button>
              <button
                type="button"
                className="flex-1 truncate text-left"
                onClick={() => onSelect({ kind: 'layer', id: l.id })}
              >
                {l.name}
              </button>
              <button
                type="button"
                className="opacity-60 hover:opacity-100 disabled:opacity-20"
                disabled={i === 0}
                onClick={() => onMove(l.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="opacity-60 hover:opacity-100 disabled:opacity-20"
                disabled={i === layers.length - 1}
                onClick={() => onMove(l.id, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="opacity-60 hover:text-red-400 hover:opacity-100"
                onClick={() => onRemove(l.id)}
              >
                ✕
              </button>
            </div>
          )
        })}
        {layers.length === 0 && (
          <p className="px-2 py-3 text-[11px] text-neutral-600">No layers yet — add one above.</p>
        )}
      </div>

      {hasBackground && (
        <button
          type="button"
          className={`${rowCls} ${
            selection?.kind === 'background'
              ? 'bg-white/10 text-neutral-100'
              : 'text-neutral-400 hover:bg-white/5'
          }`}
          onClick={() => onSelect({ kind: 'background' })}
        >
          Background
        </button>
      )}
    </div>
  )
}
