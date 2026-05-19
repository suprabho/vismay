'use client'

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  buildYamlModel,
  deleteSection,
  duplicateSection,
  moveSection,
  replaceSection,
  type SectionBlock,
} from '@/lib/yamlSections'
import { useTabIndent } from '@/lib/useTabIndent'
import MapPickerModal from './MapPickerModal'

interface Props {
  value: string
  onChange: (next: string) => void
  placeholder?: string
}

type Mode = 'cards' | 'raw'

export default function YamlCardsView({ value, onChange, placeholder }: Props) {
  const [mode, setMode] = useState<Mode>('cards')
  const deferredValue = useDeferredValue(value)
  const model = useMemo(() => buildYamlModel(deferredValue), [deferredValue])

  // No sections yet — empty config.
  const hasContent = deferredValue.trim().length > 0

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
        <ModeToggle mode={mode} onChange={setMode} />
        <div className="text-xs text-neutral-500 ml-auto truncate">
          {hasContent
            ? `${model.sections.length} section${model.sections.length === 1 ? '' : 's'}`
            : 'empty'}
          {model.parseError && <span className="text-amber-400 ml-2">parse error</span>}
        </div>
      </div>

      {mode === 'raw' || model.sections.length === 0 || model.parseError ? (
        <RawArea value={value} onChange={onChange} placeholder={placeholder} />
      ) : (
        <CardsList model={model} value={value} onChange={onChange} />
      )}
    </div>
  )
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex bg-white/5 rounded-lg p-0.5 text-xs">
      {(['cards', 'raw'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`px-3 py-1 rounded-md transition-colors ${
            mode === m ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-white'
          }`}
        >
          {m === 'cards' ? 'Cards' : 'Raw'}
        </button>
      ))}
    </div>
  )
}

function RawArea({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const onKeyDown = useTabIndent()
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      spellCheck={false}
      autoCapitalize="none"
      autoCorrect="off"
      className="flex-1 min-h-0 w-full bg-neutral-950 text-neutral-100 font-mono text-[13px] leading-relaxed p-4 resize-none outline-none focus:bg-neutral-900/40"
    />
  )
}

function CardsList({
  model,
  value,
  onChange,
}: {
  model: ReturnType<typeof buildYamlModel>
  value: string
  onChange: (next: string) => void
}) {
  const [expanded, setExpanded] = useState<number | null>(null)

  function op(name: 'duplicate' | 'up' | 'down' | 'delete', idx: number) {
    const nextRaw =
      name === 'duplicate'
        ? duplicateSection(model, idx)
        : name === 'delete'
          ? deleteSection(model, idx)
          : moveSection(model, idx, name === 'up' ? 'up' : 'down')
    onChange(nextRaw)
    // Collapse if the expanded card moved or got deleted.
    if (name === 'delete' && expanded === idx) setExpanded(null)
    else if ((name === 'up' || name === 'down') && expanded === idx) {
      setExpanded(name === 'up' ? idx - 1 : idx + 1)
    }
  }

  function editSection(idx: number, raw: string) {
    const nextRaw = replaceSection(model, idx, raw)
    onChange(nextRaw)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {model.defaults && (
        <div className="px-3 pt-3">
          <DefaultsCard
            raw={model.defaults.raw}
            onChange={(nextDefaults) => {
              const lines = value.split('\n')
              const next = [
                ...lines.slice(0, model.defaults!.startLine),
                ...nextDefaults.split('\n'),
                ...lines.slice(model.defaults!.endLine),
              ].join('\n')
              onChange(next)
            }}
          />
        </div>
      )}
      <ul className="p-3 space-y-2">
        {model.sections.map((s) => (
          <SectionCard
            key={`${s.index}-${s.startLine}`}
            section={s}
            expanded={expanded === s.index}
            onToggle={() => setExpanded(expanded === s.index ? null : s.index)}
            onEdit={(raw) => editSection(s.index, raw)}
            onDuplicate={() => op('duplicate', s.index)}
            onMoveUp={() => op('up', s.index)}
            onMoveDown={() => op('down', s.index)}
            onDelete={() => op('delete', s.index)}
            canMoveUp={s.index > 0}
            canMoveDown={s.index < model.sections.length - 1}
          />
        ))}
      </ul>
    </div>
  )
}

function DefaultsCard({ raw, onChange }: { raw: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const onKeyDown = useTabIndent()
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-white/5"
      >
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Defaults</div>
          <div className="text-sm text-neutral-400 mt-0.5">story-wide map & pin defaults</div>
        </div>
        <span className="text-neutral-500 text-sm">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <textarea
          value={raw}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          rows={Math.min(20, raw.split('\n').length + 1)}
          className="w-full bg-black/40 text-neutral-100 font-mono text-[12px] leading-relaxed px-4 py-3 resize-y outline-none border-t border-white/10"
        />
      )}
    </div>
  )
}

function SectionCard({
  section,
  expanded,
  onToggle,
  onEdit,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onDelete,
  canMoveUp,
  canMoveDown,
}: {
  section: SectionBlock
  expanded: boolean
  onToggle: () => void
  onEdit: (raw: string) => void
  onDuplicate: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}) {
  const [draft, setDraft] = useState<string>(section.raw)
  const [mapOpen, setMapOpen] = useState(false)
  const onKeyDown = useTabIndent()
  const dirty = draft !== section.raw

  // Structural ops (move/duplicate/delete) re-key this component position with
  // a different underlying section — sync the draft to the new canonical raw.
  useEffect(() => {
    setDraft(section.raw)
  }, [section.raw])

  return (
    <li className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-white/5"
      >
        <span className="text-neutral-500 font-mono text-xs shrink-0 tabular-nums">
          {String(section.index + 1).padStart(2, '0')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium truncate">{section.id ?? '(no id)'}</span>
            {section.kind && (
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 border border-white/10 rounded px-1.5 py-0.5 shrink-0">
                {section.kind}
              </span>
            )}
          </div>
          {section.text && (
            <div className="text-sm text-neutral-400 truncate mt-0.5">{section.text}</div>
          )}
        </div>
        <span className="text-neutral-500 text-sm shrink-0">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="border-t border-white/10">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            rows={Math.min(24, draft.split('\n').length + 1)}
            className="w-full bg-black/40 text-neutral-100 font-mono text-[12px] leading-relaxed px-4 py-3 resize-y outline-none"
          />
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-t border-white/10 bg-black/20">
            <CardBtn onClick={() => setMapOpen(true)}>📍 Map</CardBtn>
            <CardBtn onClick={onDuplicate}>Duplicate</CardBtn>
            <CardBtn onClick={onMoveUp} disabled={!canMoveUp}>↑</CardBtn>
            <CardBtn onClick={onMoveDown} disabled={!canMoveDown}>↓</CardBtn>
            <CardBtn onClick={() => confirm('Delete this section?') && onDelete()} tone="danger">
              Delete
            </CardBtn>
            <div className="ml-auto flex items-center gap-2">
              {dirty && (
                <CardBtn
                  onClick={() => setDraft(section.raw)}
                  tone="ghost"
                >
                  Revert
                </CardBtn>
              )}
              <CardBtn
                onClick={() => onEdit(draft)}
                disabled={!dirty}
                tone="primary"
              >
                Apply
              </CardBtn>
            </div>
          </div>
        </div>
      )}
      {mapOpen && (
        <MapPickerModal
          sectionRaw={section.raw}
          sectionLabel={`${section.id ?? 'section'}${section.kind ? ` · ${section.kind}` : ''}`}
          onApply={(next) => {
            onEdit(next)
            setMapOpen(false)
          }}
          onClose={() => setMapOpen(false)}
        />
      )}
    </li>
  )
}

function CardBtn({
  children,
  onClick,
  disabled,
  tone = 'default',
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  tone?: 'default' | 'primary' | 'danger' | 'ghost'
}) {
  const toneCls =
    tone === 'primary'
      ? 'bg-white text-neutral-950 hover:bg-neutral-200'
      : tone === 'danger'
        ? 'bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/20'
        : tone === 'ghost'
          ? 'text-neutral-400 hover:text-white'
          : 'bg-white/5 text-neutral-200 hover:bg-white/10 border border-white/10'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-xs px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 disabled:pointer-events-none ${toneCls}`}
    >
      {children}
    </button>
  )
}

