import type { ComponentType } from 'react'

/**
 * Host-registered editor for a `{ kind: 'picker' }` adminForm field.
 *
 * The viz-engine owns only the field *shape*; the concrete UI for a domain
 * picker (e.g. "pick a live fixture / team / news item") is registered here by
 * the host (footshorts, vizmaya) and resolved by `pickerId` inside
 * `VizConfigForm`. This keeps `VizConfigForm` — and the engine — free of any
 * domain types.
 *
 * A picker reads its current `value`, reports changes via `onChange`, inspects
 * `siblings` (the whole layer config — e.g. a fixture picker reads
 * `siblings.compKey`), and pulls live domain data / slug / asset refs from the
 * host-threaded `ctx`.
 */
export interface PickerEditorProps {
  value: unknown
  onChange: (value: unknown) => void
  /** The full config object this field belongs to, so a picker can read peers. */
  siblings: Record<string, unknown>
  /** Per-render host context the composer threads through (loaded data, slug, …). */
  ctx?: unknown
  /** Optional opts forwarded from the field definition. */
  params?: Record<string, unknown>
}

export type PickerEditor = ComponentType<PickerEditorProps>

const registry = new Map<string, PickerEditor>()

/**
 * Register (or replace) the editor component for a `pickerId`. Idempotent and
 * safe to call at module-eval time from a host's registration entrypoint, so a
 * double import doesn't throw.
 */
export function registerPickerEditor(id: string, editor: PickerEditor): void {
  registry.set(id, editor)
}

export function getPickerEditor(id: string): PickerEditor | undefined {
  return registry.get(id)
}

/** All registered picker ids — for diagnostics / tests. */
export function registeredPickerIds(): string[] {
  return Array.from(registry.keys())
}
