'use client'

import type { ReactNode } from 'react'
import { getVizModule, type VizLayer } from '@vismay/viz-engine'
import VizConfigForm from '../VizConfigForm'
import { ColorField, NumberSlider, TransformControls } from '../controls'
import type { ComposerHost } from './ComposerHost'
import type { ComposerSelection, ComposerState } from './types'
import { DEFAULT_TRANSFORM, type TransformLike } from './transform'
import { DEFAULT_LAYER_BOX, type LayerBox } from './box'
import { btnCls, labelCls } from './styles'

type FormValue = string | number | boolean | object | null | undefined

/** Edits the current selection: a layer's transform (free mode) + module config
 *  via `VizConfigForm` (so a `picker` field resolves to its registered domain
 *  editor), or the background via the host's options. */
export function ConfigPanel<TCtx>({
  host,
  state,
  selection,
  ctx,
  onLayerConfigChange,
  onLayerTransformChange,
  onLayerBoxChange,
  onBackgroundChange,
}: {
  host: ComposerHost<TCtx>
  state: ComposerState
  selection: ComposerSelection
  ctx: TCtx
  onLayerConfigChange: (id: string, layer: VizLayer) => void
  onLayerTransformChange: (id: string, patch: Partial<TransformLike>) => void
  onLayerBoxChange: (id: string, patch: Partial<LayerBox>) => void
  onBackgroundChange: (bg: VizLayer | null) => void
}) {
  if (selection?.kind === 'layer') {
    const layer = state.layers.find((l) => l.id === selection.id)
    const mod = layer ? getVizModule(layer.layer.type) : undefined
    if (!layer || !mod) return <Empty />
    const transform = layer.transform ?? DEFAULT_TRANSFORM
    return (
      <div className="flex flex-col">
        <div className="border-b border-white/10 px-1 pb-2 text-[11px] font-semibold text-neutral-200">
          {mod.label}
        </div>
        {host.arrangement === 'free' && (
          <Section title="Transform">
            <TransformControls
              transform={transform}
              onChange={(p) => onLayerTransformChange(layer.id, p)}
              showHeight={transform.heightPct != null}
              maxWidthPct={mod.maxWidthPct}
            />
          </Section>
        )}
        {host.arrangement === 'free' && (
          <Section title="Background">
            <LayerBoxControls box={layer.box} onChange={(p) => onLayerBoxChange(layer.id, p)} />
          </Section>
        )}
        <Section title="Content" last>
          <VizConfigForm
            module={mod}
            value={layer.layer as unknown as Record<string, FormValue>}
            onChange={(next) =>
              onLayerConfigChange(layer.id, {
                ...(next as Record<string, unknown>),
                type: layer.layer.type,
              } as VizLayer)
            }
            ctx={ctx}
          />
        </Section>
      </div>
    )
  }

  if (selection?.kind === 'background') {
    const opts = host.backgroundOptions(ctx)
    return (
      <div className="flex flex-col gap-2">
        <span className={labelCls}>Background</span>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={btnCls} onClick={() => onBackgroundChange(null)}>
            None
          </button>
          {opts.map((o) => (
            <button
              key={o.id}
              type="button"
              className={btnCls}
              onClick={() => onBackgroundChange(o.make(ctx))}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return <Empty />
}

/** Box / border / roundness / fill-opacity / backdrop-blur / shadow for the
 *  panel drawn behind a layer's content. Seeds from the default with the box
 *  off, so toggling "Box behind layer" reveals the styling controls. */
function LayerBoxControls({
  box,
  onChange,
}: {
  box: LayerBox | undefined
  onChange: (patch: Partial<LayerBox>) => void
}) {
  const b = box ?? { ...DEFAULT_LAYER_BOX, enabled: false }
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-[11px] text-neutral-300">
        <input
          type="checkbox"
          checked={b.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="accent-sky-400"
        />
        Box behind layer
      </label>
      {b.enabled && (
        <>
          <ColorField label="Fill" value={b.fill} onChange={(hex) => onChange({ fill: hex })} />
          <NumberSlider label="Fill opacity" value={b.fillOpacity} min={0} max={1} step={0.05} onChange={(v) => onChange({ fillOpacity: v })} format={(v) => v.toFixed(2)} />
          <NumberSlider label="Roundness" value={b.radiusPx} min={0} max={48} step={1} onChange={(v) => onChange({ radiusPx: v })} format={(v) => `${v}px`} />
          <NumberSlider label="Border width" value={b.borderWidthPx} min={0} max={8} step={0.5} onChange={(v) => onChange({ borderWidthPx: v })} format={(v) => `${v}px`} />
          {b.borderWidthPx > 0 && (
            <ColorField label="Border color" value={b.borderColor} onChange={(hex) => onChange({ borderColor: hex })} />
          )}
          <NumberSlider label="Background blur" value={b.blurPx} min={0} max={24} step={1} onChange={(v) => onChange({ blurPx: v })} format={(v) => `${v}px`} />
          <label className="flex items-center gap-2 text-[11px] text-neutral-300">
            <input
              type="checkbox"
              checked={b.shadow}
              onChange={(e) => onChange({ shadow: e.target.checked })}
              className="accent-sky-400"
            />
            Drop shadow
          </label>
        </>
      )}
    </div>
  )
}

/** A titled, divider-separated section — Figma-style dense panel grouping. */
function Section({ title, children, last }: { title: string; children: ReactNode; last?: boolean }) {
  return (
    <section className={`px-1 py-2.5 ${last ? '' : 'border-b border-white/10'}`}>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{title}</p>
      {children}
    </section>
  )
}

function Empty() {
  return <p className="px-1 py-2 text-[11px] text-neutral-600">Select a layer to edit its content.</p>
}
