'use client'

import { useState, type ReactNode } from 'react'
import type { Theme } from '@vismay/viz-engine'
import type { AspectRatio } from '../AspectRatioToggle'
import type {
  BackgroundLayer,
  CardComposition,
  ElementLayer,
  FontFamily,
  MapSpec,
  TextBlock,
  Transform,
} from '../layers/types'
import { DEFAULT_GRAPHIC_HEIGHT_PCT, DEFAULT_TEXT_PANEL, MAP_ASPECTS, emptyMapSpec, isBoxSized, mapBoxHeightPct, type MapAspect } from '../layers/types'
import {
  groupName,
  patchBackground,
  patchElementTransform,
  patchSelectedText,
  getSelectedText,
  setBackground,
  updateElement,
  type Selection,
} from './mutations'
import { ColorField, Field, InspectorSection, NumberSlider, TransformControls, inputCls, labelCls, selectCls } from './controls'
import { ImagePicker, type AssetEntry } from './ImagePicker'
import { IconPicker } from './IconPicker'
import { EmojiPicker } from './EmojiPicker'
import { ChartJsonDrawer } from './ChartJsonDrawer'
import { MapYamlDrawer } from './MapYamlDrawer'
import { MapSectionImport, type MapImportSources } from './MapSectionImport'

export interface MapDefaults {
  mapStyle?: string
  mapOpacity?: number
  pinColor?: string
  pinRadius?: number
}

interface Props {
  composition: CardComposition
  selection: Selection | null
  onChange: (next: CardComposition) => void
  story: {
    slug: string
    theme: Theme
    assets: AssetEntry[]
    defaults: MapDefaults
    /** Story sections (this story + others) a map layer can import its data from. */
    mapSources?: MapImportSources
  }
  ratio: AspectRatio
  onEditMap: (sel: Selection) => void
}

/** Theme colors as swatches, deduped — a theme often reuses one hex for two
 *  tokens (e.g. teal + positive), and the swatch row keys by color. */
function themeSwatches(theme: Theme): string[] {
  const c = theme.colors
  const list = [c.text, c.background, c.surface, c.muted, c.accent, c.accent2, c.teal, c.positive, c.amber, c.red].filter(
    (x): x is string => !!x,
  )
  return [...new Set(list.map((x) => x.toLowerCase()))]
}

/** Right-hand properties panel for the current selection — a titled header
 *  plus divider-separated Transform / Content sections, mirroring the
 *  footshorts composer's ConfigPanel. Every layer-level control lives here;
 *  the left panel only lists + adds layers. */
export function Inspector({ composition, selection, onChange, story, ratio, onEditMap }: Props) {
  if (!selection) {
    return <p className="px-1 py-2 text-[11px] text-neutral-600">Select a layer to edit it.</p>
  }
  switch (selection.kind) {
    case 'background':
      return <BackgroundInspector composition={composition} onChange={onChange} story={story} onEditMap={onEditMap} />
    case 'element':
      return <ElementInspector composition={composition} id={selection.id} onChange={onChange} story={story} ratio={ratio} onEditMap={onEditMap} />
    case 'text':
    case 'annotation':
      return <TextInspector composition={composition} selection={selection} onChange={onChange} theme={story.theme} />
    case 'group': {
      const group = (composition.groups ?? []).find((g) => g.id === selection.id)
      const count = composition.elements.filter((e) => e.groupId === selection.id).length
      return (
        <Panel title={group ? groupName(group) : 'Group'}>
          <InspectorSection title="Group" last>
            <p className="text-[11px] text-neutral-400">
              {count} {count === 1 ? 'layer' : 'layers'}. Drag the box on the canvas to move · corner to resize · top
              handle to rotate. Select a member in the layer list to edit it on its own.
            </p>
          </InspectorSection>
        </Panel>
      )
    }
    case 'branding':
      return (
        <Panel title="Branding footer">
          <InspectorSection title="Content" last>
            <label className="flex items-center gap-2 text-[12px] text-neutral-200">
              <input
                type="checkbox"
                checked={composition.branding.visible}
                onChange={(e) => onChange({ ...composition, branding: { ...composition.branding, visible: e.target.checked } })}
                className="accent-sky-400"
              />
              Show branding footer
            </label>
          </InspectorSection>
        </Panel>
      )
  }
}

/** Panel chrome: a bold title row over the sections. */
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="border-b border-white/10 px-1 pb-2 text-[11px] font-semibold text-neutral-200">{title}</div>
      {children}
    </div>
  )
}

// ── map controls (shared by background / hero / element maps) ────────────────
function MapControls({
  spec,
  defaults,
  onPatch,
  onEditCamera,
  sources,
}: {
  spec: MapSpec
  defaults: { mapStyle?: string; mapOpacity?: number; pinColor?: string; pinRadius?: number }
  onPatch: (patch: Partial<MapSpec>) => void
  onEditCamera: () => void
  sources?: MapImportSources
}) {
  const a = spec.appearance
  const [yamlOpen, setYamlOpen] = useState(false)
  return (
    <div className="space-y-2">
      <button
        onClick={onEditCamera}
        className="w-full rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-neutral-100 hover:bg-white/10"
      >
        Edit camera (drag &amp; zoom)
      </button>
      {sources && (
        <MapSectionImport
          sources={sources}
          // Imported data carries its own camera; drop the per-ratio camera
          // overrides so the section's view shows instead of a stale drag.
          onImport={(data) => onPatch({ data, camera: {} })}
        />
      )}
      <button
        onClick={() => setYamlOpen(true)}
        className="w-full rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-neutral-100 hover:bg-white/10"
      >
        {spec.data ? 'Edit map data (YAML)' : 'Add map data (YAML)'}
      </button>
      {spec.data && (
        <button onClick={() => onPatch({ data: undefined })} className="text-[11px] text-neutral-400 hover:text-white">
          Clear map data
        </button>
      )}
      {yamlOpen && (
        <MapYamlDrawer initial={spec.data} onApply={(data) => onPatch({ data })} onClose={() => setYamlOpen(false)} />
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {(['pins', 'regions', 'heatmap'] as const).map((k) => (
          <label key={k} className="flex items-center gap-1.5 text-[11px] capitalize text-neutral-300">
            <input
              type="checkbox"
              checked={spec.layers[k]}
              onChange={(e) => onPatch({ layers: { ...spec.layers, [k]: e.target.checked } })}
              className="accent-sky-400"
            />
            {k}
          </label>
        ))}
      </div>
      <details className="rounded-md border border-white/10 bg-neutral-950/40 px-2.5 py-2">
        <summary className="cursor-pointer select-none text-[11px] text-neutral-400">Appearance</summary>
        <div className="mt-2 space-y-2">
          <Field label="Style URL">
            <input
              value={a.mapStyle ?? ''}
              onChange={(e) => onPatch({ appearance: { ...a, mapStyle: e.target.value || undefined } })}
              placeholder={defaults.mapStyle || 'mapbox://styles/mapbox/dark-v11'}
              spellCheck={false}
              className={`${inputCls} font-mono text-[11px]`}
            />
          </Field>
          <NumberSlider
            label="Opacity"
            value={a.mapOpacity ?? defaults.mapOpacity ?? 1}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => onPatch({ appearance: { ...a, mapOpacity: v } })}
            format={(v) => v.toFixed(2)}
          />
          <ColorField
            label="Pin color"
            value={a.pinColor ?? defaults.pinColor ?? '#d85a30'}
            onChange={(hex) => onPatch({ appearance: { ...a, pinColor: hex } })}
          />
          <NumberSlider
            label="Pin radius"
            value={a.pinRadius ?? defaults.pinRadius ?? 12}
            min={2}
            max={40}
            step={1}
            onChange={(v) => onPatch({ appearance: { ...a, pinRadius: v } })}
          />
        </div>
      </details>
    </div>
  )
}

const BG_KINDS: Array<{ id: BackgroundLayer['kind']; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'map', label: 'Map' },
  { id: 'aura', label: 'Aura' },
  { id: 'image', label: 'Image' },
  { id: 'solid', label: 'Solid' },
  { id: 'gradient', label: 'Gradient' },
]

function BackgroundInspector({
  composition,
  onChange,
  story,
  onEditMap,
}: {
  composition: CardComposition
  onChange: (n: CardComposition) => void
  story: Props['story']
  onEditMap: Props['onEditMap']
}) {
  const bg = composition.background
  const swatches = themeSwatches(story.theme)

  const switchKind = (kind: BackgroundLayer['kind']) => {
    if (kind === bg.kind) return
    let next: BackgroundLayer
    switch (kind) {
      case 'none':
        next = { kind: 'none' }
        break
      case 'map':
        next = { kind: 'map', ...emptyMapSpec() }
        break
      case 'aura':
        next = { kind: 'aura', slug: '' }
        break
      case 'image':
        next = { kind: 'image', src: '', source: 'asset', objectFit: 'cover' }
        break
      case 'solid':
        next = { kind: 'solid', color: story.theme.colors.surface }
        break
      case 'gradient':
        next = { kind: 'gradient', gtype: 'linear', from: story.theme.colors.accent, to: story.theme.colors.background, angle: 180 }
        break
    }
    onChange(setBackground(composition, next))
  }

  return (
    <Panel title="Background">
      <InspectorSection title="Type" last={bg.kind === 'none'}>
        <select value={bg.kind} onChange={(e) => switchKind(e.target.value as BackgroundLayer['kind'])} className={`${selectCls} mt-0`}>
          {BG_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </InspectorSection>

      {bg.kind !== 'none' && (
        <InspectorSection title="Content" last>
          {bg.kind === 'map' && (
            <MapControls
              spec={bg}
              defaults={story.defaults}
              onPatch={(patch) => onChange(patchBackground(composition, patch))}
              onEditCamera={() => onEditMap({ kind: 'background' })}
              sources={story.mapSources}
            />
          )}

          {bg.kind === 'solid' && (
            <ColorField label="Color" value={bg.color} onChange={(hex) => onChange(patchBackground(composition, { color: hex }))} swatches={swatches} />
          )}

          {bg.kind === 'gradient' && (
            <div className="space-y-2">
              <Field label="Direction">
                <select value={bg.gtype} onChange={(e) => onChange(patchBackground(composition, { gtype: e.target.value as 'linear' | 'radial' }))} className={selectCls}>
                  <option value="linear">Linear</option>
                  <option value="radial">Radial</option>
                </select>
              </Field>
              {bg.gtype === 'linear' && (
                <NumberSlider label="Angle" value={bg.angle ?? 180} min={0} max={360} step={5} onChange={(v) => onChange(patchBackground(composition, { angle: v }))} format={(v) => `${v}°`} />
              )}
              <ColorField label="From" value={bg.from} onChange={(hex) => onChange(patchBackground(composition, { from: hex }))} swatches={swatches} />
              <ColorField label="To" value={bg.to} onChange={(hex) => onChange(patchBackground(composition, { to: hex }))} swatches={swatches} />
            </div>
          )}

          {bg.kind === 'image' && (
            <div className="space-y-2">
              <Field label="Fit">
                <select value={bg.objectFit} onChange={(e) => onChange(patchBackground(composition, { objectFit: e.target.value as 'cover' | 'contain' }))} className={selectCls}>
                  <option value="cover">Cover</option>
                  <option value="contain">Contain</option>
                </select>
              </Field>
              <ImagePicker
                assets={story.assets}
                theme={story.theme}
                ratio={'1:1' as AspectRatio}
                onPick={(src, source) => onChange(patchBackground(composition, { src, source }))}
              />
            </div>
          )}

          {bg.kind === 'aura' && (
            <div className="space-y-2">
              <Field label="Aura slug">
                <input value={bg.slug} onChange={(e) => onChange(patchBackground(composition, { slug: e.target.value }))} placeholder="aura embed slug" className={inputCls} />
              </Field>
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-200">
                Aura animates in the preview only. The export uses a still of the same scene automatically — attach a poster image below to use your own instead.
              </p>
              <span className={labelCls}>Poster image (optional export override)</span>
              {bg.posterSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bg.posterSrc} alt="" className="h-16 w-full rounded border border-white/10 object-cover" />
              )}
              <ImagePicker
                assets={story.assets}
                theme={story.theme}
                ratio={'1:1' as AspectRatio}
                onPick={(src, source) => onChange(patchBackground(composition, { posterSrc: src, posterSource: source }))}
              />
            </div>
          )}
        </InspectorSection>
      )}
    </Panel>
  )
}

function elementTitle(el: ElementLayer): string {
  switch (el.kind) {
    case 'emoji':
      return 'Emoji'
    case 'flag':
      return 'Flag'
    case 'icon':
      return 'Icon'
    case 'image':
      return el.name || 'Image'
    case 'chart':
      return 'Chart'
    case 'map':
      return 'Map'
  }
}

function ElementInspector({
  composition,
  id,
  onChange,
  story,
  ratio,
  onEditMap,
}: {
  composition: CardComposition
  id: string
  onChange: (n: CardComposition) => void
  story: Props['story']
  ratio: AspectRatio
  onEditMap: Props['onEditMap']
}) {
  const [chartOpen, setChartOpen] = useState(false)
  const el = composition.elements.find((e) => e.id === id)
  if (!el) return null

  // Map box aspect: a locked preset drives heightPct from widthPct (so W is the
  // only size field); "Free" exposes both W and H. An unboxed legacy map renders
  // square, so it reads as 1:1 here.
  const mapAspectValue: MapAspect | 'free' =
    el.kind === 'map' ? (el.aspect ?? (el.transform.heightPct == null ? '1:1' : 'free')) : 'free'
  const setMapAspect = (v: MapAspect | 'free') => {
    if (el.kind !== 'map') return
    if (v === 'free') {
      onChange(updateElement(composition, id, { aspect: undefined, transform: { ...el.transform, heightPct: el.transform.heightPct ?? mapBoxHeightPct(el.transform.widthPct, '1:1', ratio) } }))
      return
    }
    onChange(updateElement(composition, id, { aspect: v, transform: { ...el.transform, heightPct: mapBoxHeightPct(el.transform.widthPct, v, ratio) } }))
  }
  const mapAspectSelect =
    el.kind === 'map' ? (
      <Field label="Aspect">
        <select value={mapAspectValue} onChange={(e) => setMapAspect(e.target.value as MapAspect | 'free')} className={selectCls}>
          {MAP_ASPECTS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
          <option value="free">Free (W × H)</option>
        </select>
      </Field>
    ) : null
  const aspectLocked = el.kind === 'map' && !!el.aspect
  // With a locked aspect, a width change re-derives the height.
  const patchTransform = (patch: Partial<Transform>) => {
    if (el.kind === 'map' && el.aspect && patch.widthPct != null) {
      patch = { ...patch, heightPct: mapBoxHeightPct(patch.widthPct, el.aspect, ratio) }
    }
    onChange(patchElementTransform(composition, id, patch))
  }

  // Box-fit toggle for image graphics (a `heightPct` boxes them W×H; its
  // absence reverts to the intrinsic ratio).
  const fillBoxToggle =
    el.kind === 'image' ? (
      <label className="mt-2 flex items-center gap-2 text-[12px] text-neutral-200">
        <input
          type="checkbox"
          checked={el.transform.heightPct != null}
          onChange={(e) =>
            onChange(
              patchElementTransform(composition, id, {
                heightPct: e.target.checked ? el.transform.heightPct ?? DEFAULT_GRAPHIC_HEIGHT_PCT : undefined,
              }),
            )
          }
          className="accent-sky-400"
        />
        Fill box (set height)
      </label>
    ) : null

  return (
    <Panel title={elementTitle(el)}>
      <InspectorSection title="Transform">
        {mapAspectSelect && <div className="mb-2">{mapAspectSelect}</div>}
        <TransformControls
          transform={el.transform}
          showHeight={isBoxSized(el) && !aspectLocked}
          onChange={patchTransform}
        />
        {fillBoxToggle}
      </InspectorSection>

      <InspectorSection title="Content" last>
        {el.kind === 'chart' && (
          <div className="space-y-2">
            {el.chartId ? (
              <p className="text-[10px] text-neutral-500">
                Chart: <span className="font-mono text-neutral-300">{el.chartId}</span>
              </p>
            ) : (
              <p className="text-[10px] text-neutral-500">Custom chart — define it with JSON below.</p>
            )}
            <Field label="Chart heading">
              <input value={el.heading ?? ''} onChange={(e) => onChange(updateElement(composition, id, { heading: e.target.value || undefined }))} className={inputCls} />
            </Field>
            <Field label="Chart subheading">
              <input value={el.subheading ?? ''} onChange={(e) => onChange(updateElement(composition, id, { subheading: e.target.value || undefined }))} className={inputCls} />
            </Field>
            <button onClick={() => setChartOpen(true)} className="w-full rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-neutral-100 hover:bg-white/10">
              {el.dataOverride !== undefined ? 'Edit chart JSON' : el.chartId ? 'Edit chart JSON' : 'Add chart JSON'}
            </button>
            {el.dataOverride !== undefined && (
              <button
                onClick={() => onChange(updateElement(composition, id, { dataOverride: undefined }))}
                className="text-[11px] text-neutral-400 hover:text-white"
              >
                {el.chartId ? 'Clear JSON override (use story data)' : 'Remove chart JSON'}
              </button>
            )}
            {chartOpen && (
              <ChartJsonDrawer
                slug={story.slug}
                chartId={el.chartId || ''}
                initial={el.dataOverride}
                onApply={(data) => onChange(updateElement(composition, id, { dataOverride: data }))}
                onClose={() => setChartOpen(false)}
              />
            )}
          </div>
        )}

        {el.kind === 'emoji' && (
          <div>
            <span className={labelCls}>Emoji · <span className="text-neutral-300">{el.glyph}</span></span>
            <div className="mt-1 rounded-md border border-white/10 bg-neutral-950/50 p-1">
              <EmojiPicker onPick={(g) => onChange(updateElement(composition, id, { glyph: g }))} />
            </div>
          </div>
        )}

        {el.kind === 'flag' && (
          <div className="space-y-2">
            <p className="text-[11px] text-neutral-500">
              Flag · <span className="uppercase text-neutral-300">{el.code}</span>
            </p>
            <label className="flex items-center gap-2 text-[12px] text-neutral-200">
              <input
                type="checkbox"
                checked={!!el.circle}
                onChange={(e) => onChange(updateElement(composition, id, { circle: e.target.checked }))}
                className="accent-sky-400"
              />
              Clip to circle
            </label>
            <label className="flex items-center gap-2 text-[12px] text-neutral-200">
              <input
                type="checkbox"
                checked={el.widthPx != null}
                onChange={(e) =>
                  onChange(
                    updateElement(composition, id, e.target.checked ? { widthPx: 64, heightPx: 44 } : { widthPx: undefined, heightPx: undefined }),
                  )
                }
                className="accent-sky-400"
              />
              Custom size (px)
            </label>
            {el.widthPx != null && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Width (px)">
                    <input
                      type="number"
                      min={1}
                      value={el.widthPx}
                      onChange={(e) => onChange(updateElement(composition, id, { widthPx: Math.max(1, Math.round(Number(e.target.value) || 0)) }))}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Height (px)">
                    <input
                      type="number"
                      min={1}
                      value={el.heightPx ?? el.widthPx}
                      onChange={(e) => onChange(updateElement(composition, id, { heightPx: Math.max(1, Math.round(Number(e.target.value) || 0)) }))}
                      className={inputCls}
                    />
                  </Field>
                </div>
                <p className="text-[10px] text-neutral-600">Pixels are relative to the card; the export scales them with the format.</p>
              </>
            )}
          </div>
        )}

        {el.kind === 'icon' && (
          <div className="space-y-2">
            <IconPicker onPick={(name) => onChange(updateElement(composition, id, { name }))} />
            <ColorField label="Color" value={el.color} onChange={(hex) => onChange(updateElement(composition, id, { color: hex }))} swatches={themeSwatches(story.theme)} />
            <Field label="Weight">
              <select value={el.weight} onChange={(e) => onChange(updateElement(composition, id, { weight: e.target.value as typeof el.weight }))} className={selectCls}>
                {['thin', 'light', 'regular', 'bold', 'fill', 'duotone'].map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {el.kind === 'image' && (
          <div className="space-y-2">
            <Field label="Fit">
              <select value={el.objectFit} onChange={(e) => onChange(updateElement(composition, id, { objectFit: e.target.value as 'cover' | 'contain' }))} className={selectCls}>
                <option value="contain">Contain</option>
                <option value="cover">Cover</option>
              </select>
            </Field>
            <ImagePicker assets={story.assets} theme={story.theme} ratio={ratio} onPick={(src, source) => onChange(updateElement(composition, id, { src, source }))} />
          </div>
        )}

        {el.kind === 'map' && (
          <MapControls
            spec={el}
            defaults={story.defaults}
            onPatch={(patch) => onChange(updateElement(composition, id, patch))}
            onEditCamera={() => onEditMap({ kind: 'element', id })}
            sources={story.mapSources}
          />
        )}
      </InspectorSection>
    </Panel>
  )
}

const FONTS: FontFamily[] = ['serif', 'sans', 'mono']

function textTitle(selection: Selection): string {
  if (selection.kind === 'text') return selection.which === 'heading' ? 'Heading' : 'Subheading'
  return 'Annotation'
}

function TextInspector({
  composition,
  selection,
  onChange,
  theme,
}: {
  composition: CardComposition
  selection: Selection
  onChange: (n: CardComposition) => void
  theme: Theme
}) {
  const block = getSelectedText(composition, selection)
  if (!block) return null
  const patch = (p: Partial<TextBlock>) => onChange(patchSelectedText(composition, selection, p))
  const patchStyle = (s: Partial<TextBlock['style']>) => patch({ style: { ...block.style, ...s } })
  const patchTransform = (t: Partial<TextBlock['transform']>) => patch({ transform: { ...block.transform, ...t } })
  const panel = block.panel ?? { ...DEFAULT_TEXT_PANEL, enabled: false }
  const patchPanel = (pp: Partial<typeof panel>) => patch({ panel: { ...panel, ...pp } })

  return (
    <Panel title={textTitle(selection)}>
      <InspectorSection title="Transform">
        <TransformControls transform={block.transform} onChange={patchTransform} />
      </InspectorSection>

      <InspectorSection title="Content">
        <div className="space-y-2">
          <Field label="Text">
            <textarea value={block.text} onChange={(e) => patch({ text: e.target.value })} rows={3} className={`${inputCls} resize-vertical`} />
          </Field>
          <ColorField label="Color" value={block.style.color} onChange={(hex) => patchStyle({ color: hex })} swatches={themeSwatches(theme)} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Font">
              <select value={block.style.fontFamily} onChange={(e) => patchStyle({ fontFamily: e.target.value as FontFamily })} className={selectCls}>
                {FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Weight">
              <select value={block.style.fontWeight} onChange={(e) => patchStyle({ fontWeight: Number(e.target.value) })} className={selectCls}>
                {[400, 600, 700, 800].map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <NumberSlider label="Size" value={block.style.fontSizePx} min={8} max={72} step={1} onChange={(v) => patchStyle({ fontSizePx: v })} format={(v) => `${v}px`} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Align">
              <select value={block.style.align} onChange={(e) => patchStyle({ align: e.target.value as 'left' | 'center' | 'right' })} className={selectCls}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </Field>
            <NumberSlider label="Line height" value={block.style.lineHeight} min={0.9} max={2} step={0.05} onChange={(v) => patchStyle({ lineHeight: v })} format={(v) => v.toFixed(2)} />
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="Background" last>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-[11px] text-neutral-300">
            <input type="checkbox" checked={panel.enabled} onChange={(e) => patchPanel({ enabled: e.target.checked })} className="accent-sky-400" />
            Box behind text
          </label>
          {panel.enabled && (
            <>
              <ColorField label="Fill" value={panel.bg} onChange={(hex) => patchPanel({ bg: hex })} swatches={themeSwatches(theme)} />
              <NumberSlider label="Fill opacity" value={panel.bgOpacity} min={0} max={1} step={0.05} onChange={(v) => patchPanel({ bgOpacity: v })} format={(v) => v.toFixed(2)} />
              <NumberSlider label="Blur" value={panel.blurPx} min={0} max={24} step={1} onChange={(v) => patchPanel({ blurPx: v })} format={(v) => `${v}px`} />
              <NumberSlider label="Padding" value={panel.paddingPx} min={0} max={48} step={1} onChange={(v) => patchPanel({ paddingPx: v })} format={(v) => `${v}px`} />
              <NumberSlider label="Roundness" value={panel.radiusPx} min={0} max={40} step={1} onChange={(v) => patchPanel({ radiusPx: v })} format={(v) => `${v}px`} />
              <NumberSlider label="Border width" value={panel.borderWidthPx} min={0} max={8} step={0.5} onChange={(v) => patchPanel({ borderWidthPx: v })} format={(v) => `${v}px`} />
              {panel.borderWidthPx > 0 && (
                <ColorField label="Border color" value={panel.borderColor} onChange={(hex) => patchPanel({ borderColor: hex })} swatches={themeSwatches(theme)} />
              )}
            </>
          )}
        </div>
      </InspectorSection>
    </Panel>
  )
}
