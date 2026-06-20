'use client'

import { getVizModule } from '@vismay/viz-engine'
import type { ComposerLayer, ComposerSelection, ComposerState } from './types'
import { labelCls, rowCls } from './styles'
import { removeLayer, toggleLayerVisible } from './mutations'
import {
  duplicateGroup,
  groupLayers,
  groupName,
  listBlocks,
  moveGroup,
  moveLayerOrdered,
  removeGroup,
  renameGroup,
  setGroupCollapsed,
  setGroupVisible,
  ungroup,
} from './groups'

/** The layer stack: add, select, reorder, show/hide, remove, multi-select +
 *  group/ungroup — rendered as blocks (ungrouped rows + collapsible group blocks),
 *  plus a Background row. Operates on `state` + `onChange` directly. */
export function LayerListPanel({
  state,
  selection,
  multiSel,
  addTypes,
  hasBackground,
  onChange,
  onSelect,
  onToggleMulti,
  onClearMulti,
  onAdd,
}: {
  state: ComposerState
  selection: ComposerSelection
  multiSel: string[]
  addTypes: string[]
  hasBackground: boolean
  onChange: (next: ComposerState) => void
  onSelect: (sel: ComposerSelection) => void
  onToggleMulti: (id: string) => void
  onClearMulti: () => void
  onAdd: (type: string) => void
}) {
  const blocks = listBlocks(state)
  const validMulti = multiSel.filter((id) => {
    const l = state.layers.find((x) => x.id === id)
    return l && !l.groupId
  })

  const removeOne = (id: string) => {
    onChange(removeLayer(state, id))
    if (selection?.kind === 'layer' && selection.id === id) onSelect(null)
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* add buttons pinned at the top — click to add a card / element */}
      {addTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {addTypes.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onAdd(t)}
              className="rounded-md border border-white/15 px-2 py-1 text-[11px] text-neutral-300 hover:bg-white/10"
            >
              + {getVizModule(t)?.label ?? t}
            </button>
          ))}
        </div>
      )}
      <span className={labelCls}>Layers</span>

      {validMulti.length >= 2 && (
        <div className="flex items-center gap-2 rounded-md border border-sky-400/40 bg-sky-400/5 px-2 py-1.5 text-[11px]">
          <span className="text-neutral-300">{validMulti.length} selected</span>
          <button
            type="button"
            className="rounded border border-white/15 px-1.5 py-0.5 text-neutral-200 hover:bg-white/10"
            onClick={() => {
              const { state: next, groupId } = groupLayers(state, validMulti)
              if (!groupId) return
              onChange(next)
              onClearMulti()
              onSelect({ kind: 'group', id: groupId })
            }}
          >
            Group {validMulti.length}
          </button>
          <button type="button" className="text-neutral-500 hover:text-neutral-200" onClick={onClearMulti}>
            clear
          </button>
        </div>
      )}

      <div className="flex flex-col gap-1">
        {blocks.map((block, bi) => {
          if (!block.group) {
            const l = block.layers[0]
            return (
              <LayerRow
                key={l.id}
                layer={l}
                selected={selection?.kind === 'layer' && selection.id === l.id}
                checked={multiSel.includes(l.id)}
                canUp={bi > 0}
                canDown={bi < blocks.length - 1}
                onSelect={() => onSelect({ kind: 'layer', id: l.id })}
                onToggleCheck={() => onToggleMulti(l.id)}
                onToggleVisible={() => onChange(toggleLayerVisible(state, l.id))}
                onUp={() => onChange(moveLayerOrdered(state, l.id, -1))}
                onDown={() => onChange(moveLayerOrdered(state, l.id, 1))}
                onRemove={() => removeOne(l.id)}
              />
            )
          }
          const g = block.group
          const allVisible = block.layers.every((m) => m.visible)
          const sel = selection?.kind === 'group' && selection.id === g.id
          return (
            <div key={g.id} className={`rounded-md border ${sel ? 'border-sky-400/70 bg-sky-400/5' : 'border-white/15'}`}>
              <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px]">
                <button type="button" className="opacity-70 hover:opacity-100" onClick={() => onChange(setGroupCollapsed(state, g.id, !g.collapsed))}>
                  {g.collapsed ? '▸' : '▾'}
                </button>
                <button type="button" className="opacity-70 hover:opacity-100" onClick={() => onChange(setGroupVisible(state, g.id, !allVisible))}>
                  {allVisible ? '◉' : '○'}
                </button>
                <button
                  type="button"
                  className="flex-1 truncate text-left font-medium text-neutral-100"
                  onClick={() => onSelect({ kind: 'group', id: g.id })}
                  onDoubleClick={() => {
                    const n = window.prompt('Group name', groupName(g))
                    if (n) onChange(renameGroup(state, g.id, n))
                  }}
                >
                  ▣ {groupName(g)} · {block.layers.length}
                </button>
                <button type="button" title="Duplicate" className="opacity-60 hover:opacity-100" onClick={() => {
                  const { state: next, groupId } = duplicateGroup(state, g.id)
                  onChange(next)
                  if (groupId) onSelect({ kind: 'group', id: groupId })
                }}>⧉</button>
                <button type="button" title="Ungroup" className="opacity-60 hover:opacity-100" onClick={() => {
                  onChange(ungroup(state, g.id))
                  if (sel) onSelect(null)
                }}>⤢</button>
                <button type="button" className="opacity-60 hover:opacity-100 disabled:opacity-20" disabled={bi === 0} onClick={() => onChange(moveGroup(state, g.id, -1))}>↑</button>
                <button type="button" className="opacity-60 hover:opacity-100 disabled:opacity-20" disabled={bi === blocks.length - 1} onClick={() => onChange(moveGroup(state, g.id, 1))}>↓</button>
                <button type="button" className="opacity-60 hover:text-red-400 hover:opacity-100" onClick={() => {
                  onChange(removeGroup(state, g.id))
                  if (sel) onSelect(null)
                }}>✕</button>
              </div>
              {!g.collapsed && (
                <div className="space-y-1 border-t border-white/10 p-1.5">
                  {block.layers.map((m) => (
                    <LayerRow
                      key={m.id}
                      layer={m}
                      grouped
                      selected={false}
                      checked={false}
                      canUp
                      canDown
                      onSelect={() => onSelect({ kind: 'group', id: g.id })}
                      onToggleCheck={() => undefined}
                      onToggleVisible={() => onChange(toggleLayerVisible(state, m.id))}
                      onUp={() => onChange(moveLayerOrdered(state, m.id, -1))}
                      onDown={() => onChange(moveLayerOrdered(state, m.id, 1))}
                      onRemove={() => removeOne(m.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {state.layers.length === 0 && (
          <p className="px-2 py-3 text-[11px] text-neutral-600">No layers yet — add one above.</p>
        )}
      </div>

      {hasBackground && (
        <button
          type="button"
          className={`${rowCls} ${
            selection?.kind === 'background' ? 'bg-white/10 text-neutral-100' : 'text-neutral-400 hover:bg-white/5'
          }`}
          onClick={() => onSelect({ kind: 'background' })}
        >
          Background
        </button>
      )}
    </div>
  )
}

function LayerRow({
  layer,
  grouped = false,
  selected,
  checked,
  canUp,
  canDown,
  onSelect,
  onToggleCheck,
  onToggleVisible,
  onUp,
  onDown,
  onRemove,
}: {
  layer: ComposerLayer
  grouped?: boolean
  selected: boolean
  checked: boolean
  canUp: boolean
  canDown: boolean
  onSelect: () => void
  onToggleCheck: () => void
  onToggleVisible: () => void
  onUp: () => void
  onDown: () => void
  onRemove: () => void
}) {
  return (
    <div className={`${rowCls} ${selected ? 'bg-white/10 text-neutral-100' : 'text-neutral-400 hover:bg-white/5'}`}>
      {!grouped && (
        <input type="checkbox" checked={checked} onChange={onToggleCheck} className="shrink-0" title="Select for grouping" />
      )}
      <button type="button" className="opacity-70 hover:opacity-100" onClick={onToggleVisible}>
        {layer.visible ? '◉' : '○'}
      </button>
      <button type="button" className="flex-1 truncate text-left" onClick={onSelect}>
        {layer.name}
      </button>
      <button type="button" className="opacity-60 hover:opacity-100 disabled:opacity-20" disabled={!canUp} onClick={onUp}>
        ↑
      </button>
      <button type="button" className="opacity-60 hover:opacity-100 disabled:opacity-20" disabled={!canDown} onClick={onDown}>
        ↓
      </button>
      <button type="button" className="opacity-60 hover:text-red-400 hover:opacity-100" onClick={onRemove}>
        ✕
      </button>
    </div>
  )
}
