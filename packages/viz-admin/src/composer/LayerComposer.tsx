'use client'

import { useMemo, useState, type Ref } from 'react'
import { listModulesForSlot, type VizLayer } from '@vismay/viz-engine'
import type { ComposerHost } from './ComposerHost'
import type { ComposerSelection, ComposerState } from './types'
import { addLayer, patchLayerTransform, setBackground, setLayerConfig } from './mutations'
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
 * The surface-agnostic composer: a layer list (add / select / reorder / group),
 * a live preview (drag / resize / rotate / group transform in free mode), and a
 * per-layer config panel — driven by `ComposerState` + a `ComposerHost`.
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
  const [multiSel, setMultiSel] = useState<string[]>([])

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
  const onToggleMulti = (id: string) =>
    setMultiSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const handleLayerConfig = (id: string, layer: VizLayer) => onChange(setLayerConfig(state, id, layer))

  return (
    <div className="grid grid-cols-[230px_minmax(0,1fr)_260px] gap-4">
      <LayerListPanel
        state={state}
        selection={selection}
        multiSel={multiSel}
        addTypes={addTypes}
        hasBackground={host.backgroundOptions(ctx).length > 0}
        onChange={onChange}
        onSelect={onSelect}
        onToggleMulti={onToggleMulti}
        onClearMulti={() => setMultiSel([])}
        onAdd={handleAdd}
      />
      <PreviewPane
        host={host}
        state={state}
        ctx={ctx}
        captureRef={captureRef}
        selection={selection}
        multiSel={multiSel}
        onSelect={onSelect}
        onToggleMulti={onToggleMulti}
        onChange={onChange}
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
