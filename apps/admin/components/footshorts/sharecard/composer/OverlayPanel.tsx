'use client'

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AspectRatio, NewsItem, Overlay, OverlayGroup, OverlayKind, PhosphorWeight } from '../types'
import {
  addOverlay,
  duplicateGroup,
  duplicateOverlay,
  groupName,
  groupOverlays,
  listBlocks,
  moveGroup,
  moveOverlay,
  removeGroup,
  removeOverlay,
  renameGroup,
  setGroupCollapsed,
  setGroupVisible,
  uid,
  ungroupGroup,
  updateOverlay,
  type OverlayDoc,
  type Selection,
} from './overlayMutations'
import { BadgeFlagPicker } from './BadgeFlagPicker'
import { ImagePicker } from './ImagePicker'
import { EmojiPicker } from './EmojiPicker'
import { IconPicker } from './IconPicker'
import { labelCls, selectCls } from './controls'

type AddMode = null | 'badge' | 'image' | 'emoji' | 'icon'

const DEFAULT_WIDTH: Record<OverlayKind, number> = {
  crest: 18,
  logo: 18,
  flag: 18,
  image: 32,
  emoji: 14,
  icon: 12,
}

const PHOSPHOR_WEIGHTS: PhosphorWeight[] = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone']

const isSel = (a: Selection | null, b: Selection) => !!a && a.kind === b.kind && a.id === b.id

interface Props {
  doc: OverlayDoc
  onChange: (next: OverlayDoc) => void
  selection: Selection | null
  setSelection: (s: Selection | null) => void
  multiSel: string[]
  setMultiSel: (ids: string[]) => void
  /** Add-picker context. */
  ratio: AspectRatio
  paletteHexes: string[]
  news: NewsItem[] | null
  /** Default color for new icon overlays (the effective theme accent). */
  iconColor: string
}

export function OverlayPanel({
  doc,
  onChange,
  selection,
  setSelection,
  multiSel,
  setMultiSel,
  ratio,
  paletteHexes,
  news,
  iconColor,
}: Props) {
  const [addMode, setAddMode] = useState<AddMode>(null)

  const addO = (data: Partial<Overlay> & { kind: OverlayKind; label: string }) => {
    const id = uid('ov')
    const full: Overlay = {
      id,
      xPct: 50,
      yPct: 50,
      widthPct: DEFAULT_WIDTH[data.kind],
      visible: true,
      ...data,
    }
    onChange(addOverlay(doc, full))
    setSelection({ kind: 'overlay', id })
    setAddMode(null)
  }

  const blocks = useMemo(() => listBlocks(doc), [doc])

  // ── multi-select (ungrouped only) ───────────────────────────────────────────
  const toggleSel = (id: string) =>
    setMultiSel(multiSel.includes(id) ? multiSel.filter((x) => x !== id) : [...multiSel, id])

  // Stale ticks (e.g. surviving a card load) are filtered so the count + Group
  // button never lie about what will actually group.
  const validMultiSel = useMemo(
    () => multiSel.filter((id) => doc.overlays.some((o) => o.id === id && !o.groupId)),
    [multiSel, doc],
  )

  const onGroupSelected = () => {
    const { doc: next, groupId } = groupOverlays(doc, validMultiSel)
    if (!groupId) return
    onChange(next)
    setMultiSel([])
    setSelection({ kind: 'group', id: groupId })
  }

  const removeAndSel = (id: string) => {
    const next = removeOverlay(doc, id)
    if (isSel(selection, { kind: 'overlay', id })) setSelection(null)
    else if (selection?.kind === 'group' && !next.groups.some((g) => g.id === selection.id)) setSelection(null)
    onChange(next)
    if (multiSel.includes(id)) setMultiSel(multiSel.filter((x) => x !== id))
  }

  const duplicate = (id: string) => {
    const { doc: next, newId } = duplicateOverlay(doc, id)
    onChange(next)
    if (newId) setSelection({ kind: 'overlay', id: newId })
  }

  const inspectorFor = (o: Overlay) => (
    <OverlayInspector overlay={o} onChange={(patch) => onChange(updateOverlay(doc, o.id, patch))} />
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <span className={`${labelCls} block shrink-0`}>Foreground</span>

      {/* Add buttons — stay pinned; the list below scrolls. */}
      <div className="flex shrink-0 flex-wrap gap-1.5">
        {(['badge', 'image', 'emoji', 'icon'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setAddMode(addMode === m ? null : m)}
            className={`rounded-md border px-2 py-1 text-[11px] capitalize ${
              addMode === m ? 'border-sky-400/70 bg-white/5 text-white' : 'border-white/15 text-neutral-300'
            } hover:bg-white/10`}
          >
            + {m === 'badge' ? 'Crest / Flag' : m}
          </button>
        ))}
      </div>

      {/* Active add-picker, pinned under the buttons. */}
      {addMode === 'badge' && (
        <div className="shrink-0 rounded-md border border-white/10 bg-neutral-950/50 p-2">
          <BadgeFlagPicker onPick={(url, label, kind) => addO({ kind, url, label })} />
        </div>
      )}
      {addMode === 'image' && (
        <div className="max-h-[45vh] shrink-0 overflow-y-auto rounded-md border border-white/10 bg-neutral-950/50 p-2">
          <ImagePicker
            ratio={ratio}
            paletteHexes={paletteHexes}
            news={news}
            onPick={(src, source) =>
              addO({ kind: 'image', url: src, source, objectFit: 'contain', label: 'Image' })
            }
          />
        </div>
      )}
      {addMode === 'emoji' && (
        <div className="max-h-[45vh] shrink-0 overflow-y-auto rounded-md border border-white/10 bg-neutral-950/50 p-1">
          <EmojiPicker onPick={(g) => addO({ kind: 'emoji', glyph: g, label: g })} />
        </div>
      )}
      {addMode === 'icon' && (
        <div className="shrink-0 rounded-md border border-white/10 bg-neutral-950/50 p-2">
          <IconPicker
            onPick={(name) => addO({ kind: 'icon', iconName: name, iconWeight: 'bold', iconColor, label: name })}
          />
        </div>
      )}

      {/* Multi-select action bar. */}
      {validMultiSel.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 rounded-md border border-sky-400/40 bg-sky-400/5 px-2 py-1.5 text-[11px]">
          <span className="text-neutral-300">{validMultiSel.length} selected</span>
          <button
            disabled={validMultiSel.length < 2}
            onClick={onGroupSelected}
            className="rounded border border-white/15 px-2 py-0.5 text-neutral-100 hover:bg-white/10 disabled:opacity-40"
          >
            Group {validMultiSel.length} items
          </button>
          <button onClick={() => setMultiSel([])} className="ml-auto text-neutral-400 hover:text-white">
            Clear
          </button>
        </div>
      )}

      {/* Scrollable list. */}
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
        {doc.overlays.length === 0 && (
          <p className="text-[11px] text-neutral-600">No badges, images, emoji or icons yet.</p>
        )}

        {blocks.map((block, bi) => {
          const canBlockUp = bi > 0
          const canBlockDown = bi < blocks.length - 1
          if (!block.group) {
            const o = block.overlays[0]
            if (!o) return null
            const expanded = isSel(selection, { kind: 'overlay', id: o.id })
            return (
              <OverlayRow
                key={o.id}
                overlay={o}
                expanded={expanded}
                checked={multiSel.includes(o.id)}
                showCheckbox
                canUp={canBlockUp}
                canDown={canBlockDown}
                onToggleCheck={() => toggleSel(o.id)}
                onToggleVisible={() => onChange(updateOverlay(doc, o.id, { visible: o.visible === false }))}
                onSelect={() => setSelection(expanded ? null : { kind: 'overlay', id: o.id })}
                onDuplicate={() => duplicate(o.id)}
                onMoveUp={() => onChange(moveOverlay(doc, o.id, -1))}
                onMoveDown={() => onChange(moveOverlay(doc, o.id, 1))}
                onDelete={() => removeAndSel(o.id)}
                inspector={expanded ? inspectorFor(o) : null}
              />
            )
          }

          const group = block.group
          const gid = group.id
          const selectedGroup = isSel(selection, { kind: 'group', id: gid })
          const allVisible = block.overlays.every((o) => o.visible !== false)
          return (
            <div key={gid} className={`rounded-md border ${selectedGroup ? 'border-sky-400/70 bg-sky-400/5' : 'border-white/15 bg-white/[0.02]'}`}>
              <GroupHeader
                group={group}
                count={block.overlays.length}
                allVisible={allVisible}
                canUp={canBlockUp}
                canDown={canBlockDown}
                onSelect={() => setSelection(selectedGroup ? null : { kind: 'group', id: gid })}
                onToggleCollapsed={() => onChange(setGroupCollapsed(doc, gid, !group.collapsed))}
                onToggleVisible={() => onChange(setGroupVisible(doc, gid, !allVisible))}
                onRename={() => {
                  const name = window.prompt('Rename group', group.name)?.trim()
                  if (name) onChange(renameGroup(doc, gid, name))
                }}
                onDuplicate={() => {
                  const { doc: next, groupId } = duplicateGroup(doc, gid)
                  onChange(next)
                  if (groupId) setSelection({ kind: 'group', id: groupId })
                }}
                onUngroup={() => {
                  if (selectedGroup) setSelection(null)
                  onChange(ungroupGroup(doc, gid))
                }}
                onDelete={() => {
                  if (selectedGroup) setSelection(null)
                  onChange(removeGroup(doc, gid))
                }}
                onMoveUp={() => onChange(moveGroup(doc, gid, -1))}
                onMoveDown={() => onChange(moveGroup(doc, gid, 1))}
              />
              {selectedGroup && (
                <p className="px-2 pb-1.5 text-[10px] text-neutral-500">
                  Drag the box on the card to move · corner to resize · top handle to rotate.
                </p>
              )}
              {!group.collapsed && (
                <div className="space-y-1 border-t border-white/10 p-1.5">
                  {block.overlays.map((o, mi) => {
                    const expanded = isSel(selection, { kind: 'overlay', id: o.id })
                    return (
                      <OverlayRow
                        key={o.id}
                        overlay={o}
                        grouped
                        expanded={expanded}
                        checked={false}
                        showCheckbox={false}
                        canUp={mi > 0}
                        canDown={mi < block.overlays.length - 1}
                        onToggleCheck={() => {}}
                        onToggleVisible={() => onChange(updateOverlay(doc, o.id, { visible: o.visible === false }))}
                        onSelect={() => setSelection(expanded ? null : { kind: 'overlay', id: o.id })}
                        onDuplicate={() => duplicate(o.id)}
                        onMoveUp={() => onChange(moveOverlay(doc, o.id, -1))}
                        onMoveDown={() => onChange(moveOverlay(doc, o.id, 1))}
                        onDelete={() => removeAndSel(o.id)}
                        inspector={expanded ? inspectorFor(o) : null}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function overlayLabel(o: Overlay): string {
  switch (o.kind) {
    case 'emoji':
      return `${o.glyph ?? '🙂'} emoji`
    case 'icon':
      return `◆ ${o.iconName ?? 'Icon'}`
    case 'image':
      return o.label || 'Image'
    case 'flag':
      return `🏳 ${o.label}`
    default:
      return o.label || 'Badge'
  }
}

function OverlayRow({
  overlay: o,
  grouped,
  expanded,
  checked,
  showCheckbox,
  canUp,
  canDown,
  onToggleCheck,
  onToggleVisible,
  onSelect,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onDelete,
  inspector,
}: {
  overlay: Overlay
  grouped?: boolean
  expanded: boolean
  checked: boolean
  showCheckbox: boolean
  canUp: boolean
  canDown: boolean
  onToggleCheck: () => void
  onToggleVisible: () => void
  onSelect: () => void
  onDuplicate: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  inspector: ReactNode
}) {
  const visible = o.visible !== false
  return (
    <div className={`overflow-hidden rounded-md border ${expanded ? 'border-sky-400/70' : grouped ? 'border-white/5' : 'border-white/10'}`}>
      <div className={`flex items-center gap-1.5 px-2 py-1.5 text-[12px] ${expanded ? 'bg-white/5' : ''}`}>
        {showCheckbox && (
          <input type="checkbox" checked={checked} onChange={onToggleCheck} title="Select for grouping" className="accent-sky-400" />
        )}
        <button onClick={onToggleVisible} className="text-neutral-400 hover:text-white" title={visible ? 'Hide' : 'Show'}>
          {visible ? '👁' : '🚫'}
        </button>
        {o.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={o.url} alt="" className="h-5 w-5 shrink-0 object-contain" />
        ) : (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[13px]">{o.kind === 'emoji' ? o.glyph : '◆'}</span>
        )}
        <button className="flex min-w-0 flex-1 items-center gap-1 truncate text-left text-neutral-200" onClick={onSelect}>
          <span className="text-neutral-500">{expanded ? '▾' : '▸'}</span>
          <span className="truncate">{overlayLabel(o)}</span>
        </button>
        <IconBtn label="Duplicate" onClick={onDuplicate}>⧉</IconBtn>
        <IconBtn label="Up" disabled={!canUp} onClick={onMoveUp}>↑</IconBtn>
        <IconBtn label="Down" disabled={!canDown} onClick={onMoveDown}>↓</IconBtn>
        <IconBtn label="Delete" onClick={onDelete}>×</IconBtn>
      </div>
      {expanded && inspector && <div className="border-t border-white/10 p-2">{inspector}</div>}
    </div>
  )
}

function OverlayInspector({ overlay: o, onChange }: { overlay: Overlay; onChange: (patch: Partial<Overlay>) => void }) {
  const boxFit = o.heightPct != null
  return (
    <div className="space-y-2">
      <Slider label="Size" value={Math.round(o.widthPct)} min={4} max={100} step={1} suffix="%" onChange={(v) => onChange({ widthPct: v })} />
      <Slider label="Opacity" value={o.opacity ?? 1} min={0} max={1} step={0.05} fixed={2} onChange={(v) => onChange({ opacity: v })} />
      <Slider label="Rotate" value={Math.round(o.rotation ?? 0)} min={-180} max={180} step={1} suffix="°" onChange={(v) => onChange({ rotation: v })} />

      {o.kind === 'icon' && (
        <div className="grid grid-cols-2 items-center gap-2">
          <label className="flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(o.iconColor ?? '') ? (o.iconColor as string) : '#ffffff'}
              onChange={(e) => onChange({ iconColor: e.target.value })}
              className="h-7 w-9 shrink-0 rounded border border-white/10 bg-transparent"
            />
            <span className="text-[11px] text-neutral-400">Color</span>
          </label>
          <select
            value={o.iconWeight ?? 'bold'}
            onChange={(e) => onChange({ iconWeight: e.target.value as PhosphorWeight })}
            className={selectCls}
          >
            {PHOSPHOR_WEIGHTS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>
      )}

      {o.kind === 'image' && (
        <div className="space-y-2">
          <div className="flex overflow-hidden rounded-md border border-white/10">
            {(['contain', 'cover'] as const).map((fit) => (
              <button
                key={fit}
                onClick={() => onChange({ objectFit: fit })}
                className={`flex-1 px-2 py-1.5 text-[11px] capitalize ${
                  (o.objectFit ?? 'contain') === fit ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {fit}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-neutral-300">
            <input
              type="checkbox"
              checked={boxFit}
              onChange={(e) => onChange({ heightPct: e.target.checked ? Math.round(o.widthPct) : undefined })}
              className="accent-sky-400"
            />
            Set explicit height (box-fit)
          </label>
          {boxFit && (
            <Slider label="Height" value={Math.round(o.heightPct ?? 30)} min={4} max={100} step={1} suffix="%" onChange={(v) => onChange({ heightPct: v })} />
          )}
        </div>
      )}
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  fixed,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  fixed?: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="block text-[11px] text-neutral-400">
        {label} · <span className="text-neutral-300">{fixed != null ? value.toFixed(fixed) : value}{suffix ?? ''}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full"
      />
    </label>
  )
}

function GroupHeader({
  group,
  count,
  allVisible,
  canUp,
  canDown,
  onSelect,
  onToggleCollapsed,
  onToggleVisible,
  onRename,
  onDuplicate,
  onUngroup,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  group: OverlayGroup
  count: number
  allVisible: boolean
  canUp: boolean
  canDown: boolean
  onSelect: () => void
  onToggleCollapsed: () => void
  onToggleVisible: () => void
  onRename: () => void
  onDuplicate: () => void
  onUngroup: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 text-[12px]">
      <IconBtn label={group.collapsed ? 'Expand' : 'Collapse'} onClick={onToggleCollapsed}>
        {group.collapsed ? '▸' : '▾'}
      </IconBtn>
      <button onClick={onToggleVisible} className="text-neutral-400 hover:text-white" title={allVisible ? 'Hide all' : 'Show all'}>
        {allVisible ? '👁' : '🚫'}
      </button>
      <button
        className="flex min-w-0 flex-1 items-center gap-1 truncate text-left text-neutral-100"
        onClick={onSelect}
        onDoubleClick={onRename}
        title="Select group (double-click to rename)"
      >
        <span className="text-neutral-500">▣</span>
        <span className="truncate font-medium">{groupName(group)}</span>
        <span className="shrink-0 text-neutral-500">· {count}</span>
      </button>
      <IconBtn label="Duplicate group" onClick={onDuplicate}>⧉</IconBtn>
      <IconBtn label="Ungroup" onClick={onUngroup}>⤢</IconBtn>
      <IconBtn label="Move group up" disabled={!canUp} onClick={onMoveUp}>↑</IconBtn>
      <IconBtn label="Move group down" disabled={!canDown} onClick={onMoveDown}>↓</IconBtn>
      <IconBtn label="Delete group" onClick={onDelete}>×</IconBtn>
    </div>
  )
}

function IconBtn({ children, onClick, label, disabled }: { children: ReactNode; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded px-1 text-neutral-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
    >
      {children}
    </button>
  )
}
