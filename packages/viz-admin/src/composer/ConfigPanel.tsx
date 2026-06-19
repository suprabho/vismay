'use client'

import type { ReactNode } from 'react'
import { getVizModule, type VizLayer } from '@vismay/viz-engine'
import VizConfigForm from '../VizConfigForm'
import { TransformControls } from '../controls'
import type { ComposerHost } from './ComposerHost'
import type { ComposerSelection, ComposerState } from './types'
import { DEFAULT_TRANSFORM, type TransformLike } from './transform'
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
  onBackgroundChange,
}: {
  host: ComposerHost<TCtx>
  state: ComposerState
  selection: ComposerSelection
  ctx: TCtx
  onLayerConfigChange: (id: string, layer: VizLayer) => void
  onLayerTransformChange: (id: string, patch: Partial<TransformLike>) => void
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
            />
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
