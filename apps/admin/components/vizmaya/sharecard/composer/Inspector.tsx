'use client'

import { useState } from 'react'
import type { Theme } from '@vismay/viz-engine'
import type { AspectRatio } from '../AspectRatioToggle'
import type {
  BackgroundLayer,
  CardComposition,
  FontFamily,
  HeroBox,
  HeroLayer,
  ImageSource,
  MapSpec,
  TextBlock,
} from '../layers/types'
import { DEFAULT_HERO_BOX, DEFAULT_TEXT_PANEL, emptyMapSpec } from '../layers/types'
import {
  patchBackground,
  patchElementTransform,
  patchHero,
  patchSelectedText,
  getSelectedText,
  setBackground,
  setHero,
  updateElement,
  type Selection,
} from './mutations'
import { ColorField, Field, NumberSlider, TransformControls, inputCls, labelCls, selectCls } from './controls'
import { ImagePicker, type AssetEntry } from './ImagePicker'
import { IconPicker } from './IconPicker'
import { EmojiPicker } from './EmojiPicker'
import { ChartJsonDrawer } from './ChartJsonDrawer'

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
  story: { slug: string; theme: Theme; assets: AssetEntry[]; defaults: MapDefaults }
  ratio: AspectRatio
  onEditMap: (sel: Selection) => void
}

function themeSwatches(theme: Theme): string[] {
  const c = theme.colors
  return [c.text, c.background, c.surface, c.muted, c.accent, c.accent2, c.teal, c.positive, c.amber, c.red].filter(
    (x): x is string => !!x,
  )
}

export function Inspector({ composition, selection, onChange, story, ratio, onEditMap }: Props) {
  if (!selection) {
    return <p className="text-[11px] text-neutral-600">Select a layer to edit it.</p>
  }
  switch (selection.kind) {
    case 'background':
      return <BackgroundInspector composition={composition} onChange={onChange} story={story} onEditMap={onEditMap} />
    case 'hero':
      return <HeroInspector composition={composition} onChange={onChange} story={story} onEditMap={onEditMap} />
    case 'element':
      return <ElementInspector composition={composition} id={selection.id} onChange={onChange} story={story} ratio={ratio} onEditMap={onEditMap} />
    case 'text':
    case 'annotation':
      return <TextInspector composition={composition} selection={selection} onChange={onChange} theme={story.theme} />
    case 'branding':
      return (
        <label className="flex items-center gap-2 text-[12px] text-neutral-200">
          <input
            type="checkbox"
            checked={composition.branding.visible}
            onChange={(e) => onChange({ ...composition, branding: { ...composition.branding, visible: e.target.checked } })}
            className="accent-sky-400"
          />
          Show branding footer
        </label>
      )
  }
}

// ── map controls (shared by background / hero / element maps) ────────────────
function MapControls({
  spec,
  defaults,
  onPatch,
  onEditCamera,
}: {
  spec: MapSpec
  defaults: { mapStyle?: string; mapOpacity?: number; pinColor?: string; pinRadius?: number }
  onPatch: (patch: Partial<MapSpec>) => void
  onEditCamera: () => void
}) {
  const a = spec.appearance
  return (
    <div className="space-y-2">
      <button
        onClick={onEditCamera}
        className="w-full rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-neutral-100 hover:bg-white/10"
      >
        Edit camera (drag &amp; zoom)
      </button>
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

/** Size + position controls for the hero graphic's box (chart or map). */
function HeroBoxControls({ box, onChange }: { box: HeroBox; onChange: (patch: Partial<HeroBox>) => void }) {
  return (
    <div className="space-y-2 rounded-md border border-white/10 bg-neutral-950/40 p-2.5">
      <span className="text-[10px] uppercase tracking-wider text-neutral-500">Size &amp; position</span>
      <div className="grid grid-cols-2 gap-2">
        <NumberSlider label="X" value={Math.round(box.xPct)} min={0} max={100} step={1} onChange={(v) => onChange({ xPct: v })} format={(v) => `${v}%`} />
        <NumberSlider label="Y" value={Math.round(box.yPct)} min={0} max={100} step={1} onChange={(v) => onChange({ yPct: v })} format={(v) => `${v}%`} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberSlider label="Width" value={Math.round(box.widthPct)} min={10} max={100} step={1} onChange={(v) => onChange({ widthPct: v })} format={(v) => `${v}%`} />
        <NumberSlider label="Height" value={Math.round(box.heightPct)} min={10} max={100} step={1} onChange={(v) => onChange({ heightPct: v })} format={(v) => `${v}%`} />
      </div>
      <NumberSlider label="Scale" value={box.scale} min={0.05} max={2} step={0.05} onChange={(v) => onChange({ scale: v })} format={(v) => `${v.toFixed(2)}×`} />
      <NumberSlider label="Rotate" value={Math.round(box.rotation)} min={-180} max={180} step={1} onChange={(v) => onChange({ rotation: v })} format={(v) => `${v}°`} />
      <NumberSlider label="Opacity" value={box.opacity} min={0} max={1} step={0.05} onChange={(v) => onChange({ opacity: v })} format={(v) => v.toFixed(2)} />
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
    <div className="space-y-3">
      <Field label="Background type">
        <select value={bg.kind} onChange={(e) => switchKind(e.target.value as BackgroundLayer['kind'])} className={selectCls}>
          {BG_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>

      {bg.kind === 'map' && (
        <MapControls
          spec={bg}
          defaults={story.defaults}
          onPatch={(patch) => onChange(patchBackground(composition, patch))}
          onEditCamera={() => onEditMap({ kind: 'background' })}
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
            Aura animates in the preview only. Attach a poster image below — that&apos;s what lands in the exported PNG.
          </p>
          <span className={labelCls}>Poster image (for export)</span>
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
    </div>
  )
}

function HeroInspector({
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
  const hero = composition.hero
  const [chartOpen, setChartOpen] = useState(false)

  const switchKind = (kind: 'none' | 'chart' | 'map') => {
    if (kind === 'none') return onChange(setHero(composition, undefined))
    if (kind === 'map') return onChange(setHero(composition, { kind: 'map', ...emptyMapSpec() }))
    // chart — needs a chartId; keep existing if any, else blank (panel shows hint)
    const existing = hero?.kind === 'chart' ? hero.chartId : ''
    onChange(setHero(composition, { kind: 'chart', chartId: existing }))
  }

  return (
    <div className="space-y-3">
      <Field label="Hero graphic">
        <select value={hero?.kind ?? 'none'} onChange={(e) => switchKind(e.target.value as 'none' | 'chart' | 'map')} className={selectCls}>
          <option value="none">None</option>
          <option value="chart">Chart</option>
          <option value="map">Map</option>
        </select>
      </Field>

      {hero && (
        <HeroBoxControls
          box={hero.box ?? DEFAULT_HERO_BOX}
          onChange={(p) => onChange(patchHero(composition, { box: { ...(hero.box ?? DEFAULT_HERO_BOX), ...p } }))}
        />
      )}

      {hero?.kind === 'map' && (
        <MapControls
          spec={hero}
          defaults={story.defaults}
          onPatch={(patch) => onChange(patchHero(composition, patch))}
          onEditCamera={() => onEditMap({ kind: 'hero' })}
        />
      )}

      {hero?.kind === 'chart' && (
        <div className="space-y-2">
          {hero.chartId ? (
            <p className="text-[10px] text-neutral-500">
              Chart: <span className="font-mono text-neutral-300">{hero.chartId}</span>
            </p>
          ) : (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-200">
              This section has no chart to show.
            </p>
          )}
          <Field label="Chart heading">
            <input value={hero.heading ?? ''} onChange={(e) => onChange(patchHero(composition, { heading: e.target.value || undefined }))} className={inputCls} />
          </Field>
          <Field label="Chart subheading">
            <input value={hero.subheading ?? ''} onChange={(e) => onChange(patchHero(composition, { subheading: e.target.value || undefined }))} className={inputCls} />
          </Field>
          {hero.chartId && (
            <button onClick={() => setChartOpen(true)} className="w-full rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-neutral-100 hover:bg-white/10">
              Edit chart JSON
            </button>
          )}
          {hero.dataOverride !== undefined && (
            <button
              onClick={() => onChange(patchHero(composition, { dataOverride: undefined }))}
              className="text-[11px] text-neutral-400 hover:text-white"
            >
              Clear JSON override (use story data)
            </button>
          )}
          {chartOpen && hero.chartId && (
            <ChartJsonDrawer
              slug={story.slug}
              chartId={hero.chartId}
              initial={hero.dataOverride}
              onApply={(data) => onChange(patchHero(composition, { dataOverride: data }))}
              onClose={() => setChartOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  )
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
  const el = composition.elements.find((e) => e.id === id)
  if (!el) return null

  const transform = (
    <TransformControls transform={el.transform} onChange={(patch) => onChange(patchElementTransform(composition, id, patch))} />
  )

  return (
    <div className="space-y-3">
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
        <MapControls spec={el} defaults={story.defaults} onPatch={(patch) => onChange(updateElement(composition, id, patch))} onEditCamera={() => onEditMap({ kind: 'element', id })} />
      )}

      {transform}
    </div>
  )
}

const FONTS: FontFamily[] = ['serif', 'sans', 'mono']

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
    <div className="space-y-3">
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
      <TransformControls transform={block.transform} onChange={patchTransform} />

      <details className="rounded-md border border-white/10 bg-neutral-950/40 px-2.5 py-2">
        <summary className="cursor-pointer select-none text-[11px] text-neutral-400">Box style (panel)</summary>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2 text-[11px] text-neutral-300">
            <input type="checkbox" checked={panel.enabled} onChange={(e) => patchPanel({ enabled: e.target.checked })} className="accent-sky-400" />
            Background panel
          </label>
          {panel.enabled && (
            <>
              <ColorField label="Background" value={panel.bg} onChange={(hex) => patchPanel({ bg: hex })} swatches={themeSwatches(theme)} />
              <NumberSlider label="Background opacity" value={panel.bgOpacity} min={0} max={1} step={0.05} onChange={(v) => patchPanel({ bgOpacity: v })} format={(v) => v.toFixed(2)} />
              <NumberSlider label="Blur" value={panel.blurPx} min={0} max={24} step={1} onChange={(v) => patchPanel({ blurPx: v })} format={(v) => `${v}px`} />
              <NumberSlider label="Padding" value={panel.paddingPx} min={0} max={48} step={1} onChange={(v) => patchPanel({ paddingPx: v })} format={(v) => `${v}px`} />
              <NumberSlider label="Corner radius" value={panel.radiusPx} min={0} max={40} step={1} onChange={(v) => patchPanel({ radiusPx: v })} format={(v) => `${v}px`} />
              <NumberSlider label="Border width" value={panel.borderWidthPx} min={0} max={8} step={0.5} onChange={(v) => patchPanel({ borderWidthPx: v })} format={(v) => `${v}px`} />
              <ColorField label="Border color" value={panel.borderColor} onChange={(hex) => patchPanel({ borderColor: hex })} swatches={themeSwatches(theme)} />
            </>
          )}
        </div>
      </details>
    </div>
  )
}
