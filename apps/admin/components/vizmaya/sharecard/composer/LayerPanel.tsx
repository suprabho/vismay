'use client'

import { useMemo, useState } from 'react'
import type { Theme } from '@vismay/viz-engine'
import type { AspectRatio } from '../AspectRatioToggle'
import { FLAG_COUNTRIES, flagImageUrl, flagThumbUrl } from '../flags'
import type { CardComposition, ElementLayer, TextBlock, Transform } from '../layers/types'
import { DEFAULT_GRAPHIC_HEIGHT_PCT, DEFAULT_TRANSFORM, emptyMapSpec } from '../layers/types'
import {
  addAnnotation,
  addElement,
  moveElement,
  removeAnnotation,
  removeElement,
  setHeading,
  setSubheading,
  uid,
  updateElement,
  type Selection,
} from './mutations'
import { ImagePicker, type AssetEntry } from './ImagePicker'
import { IconPicker } from './IconPicker'
import { EmojiPicker } from './EmojiPicker'
import { Inspector, type MapDefaults } from './Inspector'
import { labelCls } from './controls'

export type LayerSection = 'background' | 'text' | 'elements' | 'branding'

/** Story slice the inline element inspectors need (superset of `story`). */
export interface InspectorStory {
  slug: string
  theme: Theme
  assets: AssetEntry[]
  defaults: MapDefaults
}

interface Props {
  composition: CardComposition
  onChange: (next: CardComposition) => void
  selection: Selection | null
  setSelection: (s: Selection | null) => void
  story: { slug: string; theme: Theme; assets: AssetEntry[] }
  /** Which slot sections to render. Defaults to all (the icon-rail tabs pass a
   *  single section). */
  sections?: LayerSection[]
  /** When present, each element renders as a collapsible card with its inspector
   *  inline in the expanded body. Required to edit elements from the panel. */
  inspectorStory?: InspectorStory
  ratio?: AspectRatio
  onEditMap?: (s: Selection) => void
  /** Story chart id used to seed a "+ Chart" graphic (blank → custom chart). */
  defaultChartId?: string
}

type AddMode = null | 'emoji' | 'flag' | 'icon' | 'image'

const ELEMENT_DEFAULT_WIDTH: Record<ElementLayer['kind'], number> = {
  emoji: 14,
  flag: 18,
  icon: 12,
  image: 32,
  chart: 90,
  map: 60,
}

/** Newly added graphics get a width×height box; decorations size by width only. */
function newTransform(kind: ElementLayer['kind']): Transform {
  const base: Transform = { ...DEFAULT_TRANSFORM, widthPct: ELEMENT_DEFAULT_WIDTH[kind] }
  if (kind === 'chart') return { ...base, yPct: 56, heightPct: DEFAULT_GRAPHIC_HEIGHT_PCT }
  if (kind === 'map') return { ...base, heightPct: 45 }
  return base
}

const isSel = (a: Selection | null, b: Selection) => !!a && JSON.stringify(a) === JSON.stringify(b)

const rowCls = (active: boolean) =>
  `flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[12px] ${active ? 'border-sky-400/70 bg-white/5' : 'border-white/10'}`

export function LayerPanel({
  composition,
  onChange,
  selection,
  setSelection,
  story,
  sections,
  inspectorStory,
  ratio,
  onEditMap,
  defaultChartId,
}: Props) {
  const [addMode, setAddMode] = useState<AddMode>(null)
  const show = (s: LayerSection) => !sections || sections.includes(s)

  const newText = (): TextBlock => ({
    id: uid('txt'),
    text: 'Text',
    visible: true,
    transform: { ...DEFAULT_TRANSFORM, widthPct: 70 },
    style: { color: story.theme.colors.text, fontFamily: 'sans', fontWeight: 600, fontSizePx: 16, align: 'left', lineHeight: 1.3 },
  })

  const addEl = (data: Partial<ElementLayer> & { kind: ElementLayer['kind'] }, name: string) => {
    const id = uid('el')
    const full = { id, name, visible: true, locked: false, transform: newTransform(data.kind), ...data } as ElementLayer
    onChange(addElement(composition, full))
    setSelection({ kind: 'element', id })
    setAddMode(null)
  }

  return (
    <div className="space-y-4">
      {/* Background */}
      {show('background') && (
        <Section title="Background">
          <button className={`w-full ${rowCls(isSel(selection, { kind: 'background' }))}`} onClick={() => setSelection({ kind: 'background' })}>
            <span className="flex-1 text-left capitalize text-neutral-200">{composition.background.kind}</span>
          </button>
        </Section>
      )}

      {/* Text */}
      {show('text') && (
      <Section title="Text">
        <TextRow
          label="Heading"
          block={composition.text.heading}
          active={isSel(selection, { kind: 'text', which: 'heading' })}
          onSelect={() => setSelection({ kind: 'text', which: 'heading' })}
          onAdd={() => {
            onChange(setHeading(composition, newText()))
            setSelection({ kind: 'text', which: 'heading' })
          }}
          onRemove={() => {
            if (isSel(selection, { kind: 'text', which: 'heading' })) setSelection(null)
            onChange(setHeading(composition, undefined))
          }}
        />
        <TextRow
          label="Subheading"
          block={composition.text.subheading}
          active={isSel(selection, { kind: 'text', which: 'subheading' })}
          onSelect={() => setSelection({ kind: 'text', which: 'subheading' })}
          onAdd={() => {
            onChange(setSubheading(composition, newText()))
            setSelection({ kind: 'text', which: 'subheading' })
          }}
          onRemove={() => {
            if (isSel(selection, { kind: 'text', which: 'subheading' })) setSelection(null)
            onChange(setSubheading(composition, undefined))
          }}
        />
        {composition.text.annotations.map((a) => (
          <div key={a.id} className={rowCls(isSel(selection, { kind: 'annotation', id: a.id }))}>
            <button className="min-w-0 flex-1 truncate text-left text-neutral-200" onClick={() => setSelection({ kind: 'annotation', id: a.id })}>
              {a.text.slice(0, 24) || 'Annotation'}
            </button>
            <IconBtn
              label="Delete"
              onClick={() => {
                if (isSel(selection, { kind: 'annotation', id: a.id })) setSelection(null)
                onChange(removeAnnotation(composition, a.id))
              }}
            >
              ×
            </IconBtn>
          </div>
        ))}
        <button
          onClick={() => {
            const block = newText()
            block.transform = { ...block.transform, yPct: 60 }
            onChange(addAnnotation(composition, block))
            setSelection({ kind: 'annotation', id: block.id })
          }}
          className="w-full rounded-md border border-dashed border-white/15 px-2 py-1.5 text-[11px] text-neutral-400 hover:bg-white/5"
        >
          + Annotation box
        </button>
      </Section>
      )}

      {/* Foreground (graphics + decorations) — reorderable, collapsible cards */}
      {show('elements') && (
      <Section title="Foreground">
        {composition.elements.length === 0 && <p className="text-[11px] text-neutral-600">No graphics or elements yet.</p>}
        {composition.elements.map((el, i) => {
          const expanded = isSel(selection, { kind: 'element', id: el.id })
          return (
            <div key={el.id} className={`overflow-hidden rounded-md border ${expanded ? 'border-sky-400/70' : 'border-white/10'}`}>
              <div className={`flex items-center gap-1.5 px-2 py-1.5 text-[12px] ${expanded ? 'bg-white/5' : ''}`}>
                <button
                  onClick={() => onChange(updateElement(composition, el.id, { visible: !el.visible }))}
                  className="text-neutral-400 hover:text-white"
                  title={el.visible ? 'Hide' : 'Show'}
                >
                  {el.visible ? '👁' : '🚫'}
                </button>
                <button
                  className="flex min-w-0 flex-1 items-center gap-1 truncate text-left text-neutral-200"
                  onClick={() => setSelection(expanded ? null : { kind: 'element', id: el.id })}
                >
                  <span className="text-neutral-500">{expanded ? '▾' : '▸'}</span>
                  <span className="truncate">{elementLabel(el)}</span>
                </button>
                <IconBtn label="Up" disabled={i === 0} onClick={() => onChange(moveElement(composition, el.id, -1))}>↑</IconBtn>
                <IconBtn label="Down" disabled={i === composition.elements.length - 1} onClick={() => onChange(moveElement(composition, el.id, 1))}>↓</IconBtn>
                <IconBtn
                  label="Delete"
                  onClick={() => {
                    if (expanded) setSelection(null)
                    onChange(removeElement(composition, el.id))
                  }}
                >
                  ×
                </IconBtn>
              </div>
              {expanded && inspectorStory && ratio && onEditMap && (
                <div className="border-t border-white/10 p-2">
                  <Inspector
                    composition={composition}
                    selection={{ kind: 'element', id: el.id }}
                    onChange={onChange}
                    story={inspectorStory}
                    ratio={ratio}
                    onEditMap={onEditMap}
                  />
                </div>
              )}
            </div>
          )
        })}

        {/* Graphics first, then decorations. */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => addEl({ kind: 'chart', chartId: defaultChartId ?? '' }, 'Chart')}
            className="rounded-md border border-white/15 px-2 py-1 text-[11px] text-neutral-300 hover:bg-white/10"
          >
            + Chart
          </button>
          <button
            onClick={() => addEl({ kind: 'map', ...emptyMapSpec() }, 'Map')}
            className="rounded-md border border-white/15 px-2 py-1 text-[11px] text-neutral-300 hover:bg-white/10"
          >
            + Map
          </button>
          {(['image', 'emoji', 'icon', 'flag'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setAddMode(addMode === m ? null : m)}
              className={`rounded-md border px-2 py-1 text-[11px] capitalize ${addMode === m ? 'border-sky-400/70 bg-white/5 text-white' : 'border-white/15 text-neutral-300'} hover:bg-white/10`}
            >
              + {m}
            </button>
          ))}
        </div>

        {addMode === 'emoji' && (
          <div className="rounded-md border border-white/10 bg-neutral-950/50 p-1">
            <EmojiPicker onPick={(g) => addEl({ kind: 'emoji', glyph: g }, g)} />
          </div>
        )}
        {addMode === 'flag' && <FlagAdd onAdd={(code, name) => addEl({ kind: 'flag', code, src: flagImageUrl(code) }, name)} />}
        {addMode === 'icon' && (
          <div className="rounded-md border border-white/10 bg-neutral-950/50 p-2">
            <IconPicker onPick={(name) => addEl({ kind: 'icon', name, weight: 'bold', color: story.theme.colors.accent }, name)} />
          </div>
        )}
        {addMode === 'image' && (
          <div className="rounded-md border border-white/10 bg-neutral-950/50 p-2">
            <ImagePicker
              assets={story.assets}
              theme={story.theme}
              ratio={'1:1' as AspectRatio}
              onPick={(src, source) => addEl({ kind: 'image', src, source, objectFit: 'contain' }, 'Image')}
            />
          </div>
        )}
      </Section>
      )}

      {/* Branding */}
      {show('branding') && (
        <Section title="Branding">
          <button className={`w-full ${rowCls(isSel(selection, { kind: 'branding' }))}`} onClick={() => setSelection({ kind: 'branding' })}>
            <span className="flex-1 text-left text-neutral-200">Footer {composition.branding.visible ? '· on' : '· off'}</span>
          </button>
        </Section>
      )}
    </div>
  )
}

function elementLabel(el: ElementLayer): string {
  switch (el.kind) {
    case 'emoji':
      return `${el.glyph} emoji`
    case 'flag':
      return `🏳 ${el.code.toUpperCase()}`
    case 'icon':
      return `◆ ${el.name}`
    case 'image':
      return el.name || 'Image'
    case 'chart':
      return `📊 ${el.chartId || 'Custom chart'}`
    case 'map':
      return '🗺 Map'
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <span className={`${labelCls} mb-1.5 block`}>{title}</span>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function IconBtn({ children, onClick, label, disabled }: { children: React.ReactNode; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded px-1 text-neutral-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function TextRow({
  label,
  block,
  active,
  onSelect,
  onAdd,
  onRemove,
}: {
  label: string
  block: TextBlock | undefined
  active: boolean
  onSelect: () => void
  onAdd: () => void
  onRemove: () => void
}) {
  if (!block) {
    return (
      <button onClick={onAdd} className="w-full rounded-md border border-dashed border-white/15 px-2 py-1.5 text-left text-[11px] text-neutral-400 hover:bg-white/5">
        + {label}
      </button>
    )
  }
  return (
    <div className={rowCls(active)}>
      <button className="min-w-0 flex-1 truncate text-left text-neutral-200" onClick={onSelect}>
        <span className="text-neutral-500">{label}:</span> {block.text.slice(0, 22) || '—'}
      </button>
      <IconBtn label="Delete" onClick={onRemove}>×</IconBtn>
    </div>
  )
}

function FlagAdd({ onAdd }: { onAdd: (code: string, name: string) => void }) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return FLAG_COUNTRIES
    return FLAG_COUNTRIES.filter((f) => f.name.toLowerCase().includes(s) || f.code.includes(s))
  }, [q])
  return (
    <div className="rounded-md border border-white/10 bg-neutral-950/50 p-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a country…"
        className="mb-1.5 w-full rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-white/30"
      />
      <div className="grid max-h-36 grid-cols-6 gap-1.5 overflow-y-auto">
        {filtered.map((f) => (
          <button
            key={f.code}
            onClick={() => onAdd(f.code, f.name)}
            title={f.name}
            className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-sm border border-white/10 bg-neutral-900 hover:border-white/30"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={flagThumbUrl(f.code)} alt={f.name} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  )
}
