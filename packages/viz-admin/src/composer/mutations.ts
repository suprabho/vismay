import type { VizLayer } from '@vismay/viz-engine'
import type { ComposerLayer, ComposerState } from './types'
import { DEFAULT_TRANSFORM, type TransformLike } from './transform'
import { DEFAULT_LAYER_BOX, type LayerBox } from './box'

/**
 * Pure, immutable operations over `ComposerState`. The shell calls these in
 * response to user actions; persistence/serialization is the host's concern.
 * Stack/regions focused — free-transform geometry + grouping (m4) layer on top
 * of these via the host's geometry adapter.
 */

let seq = 0
export function composerUid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${seq++}`
}

export function addLayer(state: ComposerState, layer: ComposerLayer, at?: number): ComposerState {
  const layers = [...state.layers]
  const idx = at == null ? layers.length : Math.max(0, Math.min(at, layers.length))
  layers.splice(idx, 0, layer)
  return { ...state, layers }
}

export function removeLayer(state: ComposerState, id: string): ComposerState {
  return { ...state, layers: state.layers.filter((l) => l.id !== id) }
}

export function updateLayer(
  state: ComposerState,
  id: string,
  patch: Partial<ComposerLayer>,
): ComposerState {
  return { ...state, layers: state.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }
}

/** Replace a layer's engine config (module config object), keeping editor meta. */
export function setLayerConfig(state: ComposerState, id: string, layer: VizLayer): ComposerState {
  return { ...state, layers: state.layers.map((l) => (l.id === id ? { ...l, layer } : l)) }
}

/** Shallow-merge fields into a layer's engine config. */
export function patchLayerConfig(
  state: ComposerState,
  id: string,
  patch: Record<string, unknown>,
): ComposerState {
  return {
    ...state,
    layers: state.layers.map((l) =>
      l.id === id ? { ...l, layer: { ...l.layer, ...patch } } : l,
    ),
  }
}

export function moveLayerToIndex(state: ComposerState, id: string, to: number): ComposerState {
  const from = state.layers.findIndex((l) => l.id === id)
  if (from < 0) return state
  const layers = [...state.layers]
  const [item] = layers.splice(from, 1)
  const dest = Math.max(0, Math.min(to, layers.length))
  layers.splice(dest, 0, item)
  return { ...state, layers }
}

/** Move a layer one step in order (+1 toward the end, −1 toward the start). */
export function moveLayer(state: ComposerState, id: string, dir: 1 | -1): ComposerState {
  const i = state.layers.findIndex((l) => l.id === id)
  if (i < 0) return state
  const j = i + dir
  if (j < 0 || j >= state.layers.length) return state
  const layers = [...state.layers]
  ;[layers[i], layers[j]] = [layers[j], layers[i]]
  return { ...state, layers }
}

/** Duplicate a layer right after the source; returns the new id so the caller
 *  can select it. */
export function duplicateLayer(
  state: ComposerState,
  id: string,
): { state: ComposerState; newId: string | null } {
  const src = state.layers.find((l) => l.id === id)
  if (!src) return { state, newId: null }
  const newId = composerUid('layer')
  const copy: ComposerLayer = { ...src, id: newId, name: `${src.name} copy`, layer: { ...src.layer } }
  const i = state.layers.findIndex((l) => l.id === id)
  const layers = [...state.layers.slice(0, i + 1), copy, ...state.layers.slice(i + 1)]
  return { state: { ...state, layers }, newId }
}

export function toggleLayerVisible(state: ComposerState, id: string): ComposerState {
  return {
    ...state,
    layers: state.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
  }
}

export function setLayerRegion(
  state: ComposerState,
  id: string,
  region: string | undefined,
): ComposerState {
  return { ...state, layers: state.layers.map((l) => (l.id === id ? { ...l, region } : l)) }
}

export function setBackground(state: ComposerState, background: VizLayer | null): ComposerState {
  return { ...state, background }
}

/** Merge a partial transform into a layer (free mode), seeding from the default
 *  when the layer has none yet. */
export function patchLayerTransform(
  state: ComposerState,
  id: string,
  patch: Partial<TransformLike>,
): ComposerState {
  return {
    ...state,
    layers: state.layers.map((l) =>
      l.id === id ? { ...l, transform: { ...(l.transform ?? DEFAULT_TRANSFORM), ...patch } } : l,
    ),
  }
}

/** Merge a partial box style into a layer's background panel (free mode),
 *  seeding from the default when the layer has none yet. */
export function patchLayerBox(
  state: ComposerState,
  id: string,
  patch: Partial<LayerBox>,
): ComposerState {
  return {
    ...state,
    layers: state.layers.map((l) =>
      l.id === id ? { ...l, box: { ...(l.box ?? DEFAULT_LAYER_BOX), ...patch } } : l,
    ),
  }
}
