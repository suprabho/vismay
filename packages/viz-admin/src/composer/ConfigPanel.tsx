'use client'

import { getVizModule, type VizLayer } from '@vismay/viz-engine'
import VizConfigForm from '../VizConfigForm'
import type { ComposerHost } from './ComposerHost'
import type { ComposerSelection, ComposerState } from './types'
import { btnCls, labelCls } from './styles'

type FormValue = string | number | boolean | object | null | undefined

/** Edits the current selection: a layer's module config via `VizConfigForm`
 *  (so a `picker` field resolves to its registered domain editor), or the
 *  background via the host's options. */
export function ConfigPanel<TCtx>({
  host,
  state,
  selection,
  ctx,
  onLayerConfigChange,
  onBackgroundChange,
}: {
  host: ComposerHost<TCtx>
  state: ComposerState
  selection: ComposerSelection
  ctx: TCtx
  onLayerConfigChange: (id: string, layer: VizLayer) => void
  onBackgroundChange: (bg: VizLayer | null) => void
}) {
  if (selection?.kind === 'layer') {
    const layer = state.layers.find((l) => l.id === selection.id)
    const mod = layer ? getVizModule(layer.layer.type) : undefined
    if (!layer || !mod) return <Empty />
    return (
      <div className="flex flex-col gap-3">
        <span className={labelCls}>{mod.label}</span>
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

function Empty() {
  return <p className="text-[11px] text-neutral-600">Select a layer to edit its content.</p>
}
