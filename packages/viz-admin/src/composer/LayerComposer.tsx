'use client'

import { useMemo, type Ref } from 'react'
import { listModulesForSlot, type VizLayer } from '@vismay/viz-engine'
import type { ComposerHost } from './ComposerHost'
import type { ComposerSelection, ComposerState } from './types'
import {
  addLayer,
  moveLayer,
  patchLayerTransform,
  removeLayer,
  setBackground,
  setLayerConfig,
  toggleLayerVisible,
} from './mutations'
import { LayerListPanel } from './LayerListPanel'
import { ConfigPanel } from './ConfigPanel'
import { PreviewPane } from './PreviewPane'

export interface LayerComposerProps<TCtx> {
  host: ComposerHost<TCtx>
  /** Controlled state — the host surface owns persistence; the shell never saves. */
  state: ComposerState
  onChange: (next: ComposerState) => void
  selection: ComposerSelection
  onSelect: (sel: ComposerSelection) => void
  /** Per-render host context threaded to picker editors + the frame. */
  ctx: TCtx
  /** Capture root ref for PNG export, forwarded to `host.renderFrame`. */
  captureRef?: Ref<HTMLDivElement>
}

/**
 * The surface-agnostic composer: a layer list (add/select/reorder/remove), a
 * live preview, and a per-layer config panel — driven entirely by `ComposerState`
 * + a `ComposerHost`. Domain specifics (which modules, the frame, backgrounds,
 * persistence) live behind the host.
 */
export function LayerComposer<TCtx>({
  host,
  state,
  onChange,
  selection,
  onSelect,
  ctx,
  captureRef,
}: LayerComposerProps<TCtx>) {
  // Module types offered in the add menu: the host's allowlist ∩ the foreground slot.
  const addTypes = useMemo(() => {
    const allowed = new Set(host.allowedModuleTypes(ctx))
    return listModulesForSlot('foreground')
      .map((m) => m.type)
      .filter((t) => allowed.has(t))
  }, [host, ctx])

  const handleAdd = (type: string) => {
    const layer = host.makeLayer(type, ctx)
    onChange(addLayer(state, layer))
    onSelect({ kind: 'layer', id: layer.id })
  }
  const handleRemove = (id: string) => {
    onChange(removeLayer(state, id))
    if (selection?.kind === 'layer' && selection.id === id) onSelect(null)
  }
  const handleLayerConfig = (id: string, layer: VizLayer) => onChange(setLayerConfig(state, id, layer))

  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)_260px] gap-4">
      <LayerListPanel
        layers={state.layers}
        selection={selection}
        addTypes={addTypes}
        hasBackground={host.backgroundOptions(ctx).length > 0}
        onAdd={handleAdd}
        onSelect={onSelect}
        onMove={(id, dir) => onChange(moveLayer(state, id, dir))}
        onRemove={handleRemove}
        onToggleVisible={(id) => onChange(toggleLayerVisible(state, id))}
      />
      <PreviewPane
        host={host}
        state={state}
        ctx={ctx}
        captureRef={captureRef}
        selection={selection}
        onSelect={onSelect}
        onTransform={(id, patch) => onChange(patchLayerTransform(state, id, patch))}
      />
      <ConfigPanel
        host={host}
        state={state}
        selection={selection}
        ctx={ctx}
        onLayerConfigChange={handleLayerConfig}
        onLayerTransformChange={(id, patch) => onChange(patchLayerTransform(state, id, patch))}
        onBackgroundChange={(bg) => onChange(setBackground(state, bg))}
      />
    </div>
  )
}
