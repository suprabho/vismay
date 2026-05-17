import type { ComponentType, RefObject } from 'react'

export type VizSlot = 'foreground' | 'background'

export interface VizCaptureHandle {
  freeze: () => Promise<void> | void
  resume?: () => void
}

export interface VizLayerStyle {
  position?: { x?: 'left' | 'center' | 'right' | string; y?: 'top' | 'center' | 'bottom' | string }
  size?: { width?: string; height?: string }
  opacity?: number
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'difference'
  pointerEvents?: 'auto' | 'none'
  zIndex?: number
}

export interface VizRef<TKind extends string = string> {
  type: TKind
  [key: string]: unknown
}

export type VizLayer = VizRef & { style?: VizLayerStyle }

export interface VizRenderProps<TConfig> {
  slug: string
  unitKey: string
  config: TConfig
  activeStep: number
  mode: 'scroll' | 'autoplay' | 'capture' | 'print'
  noteReady: () => void
  captureRef?: RefObject<VizCaptureHandle | null>
  isActive: boolean
}

/**
 * Props for a background module mounted in `persistent-aggregated` mode. The
 * slot mounts ONE component instance per stableIdentity and feeds it the
 * per-unit configs (nulls for units that don't reference this instance).
 *
 * Used by the map module — Mapbox disposal is expensive enough that the
 * single Map instance must persist across every unit, with camera state
 * derived from the per-unit configs and toggled by `activeUnit`.
 */
export interface VizPersistentRenderProps<TConfig> {
  slug: string
  /** One entry per unit. `null` if that unit's background stack omits this layer. */
  configs: (TConfig | null)[]
  activeUnit: number
  mode: 'scroll' | 'autoplay' | 'capture' | 'print'
  noteReady: () => void
  captureRef?: RefObject<VizCaptureHandle | null>
}

export type AdminFormField =
  | { kind: 'asset'; key: string; label: string; accept: string[]; required?: boolean }
  | { kind: 'text'; key: string; label: string; placeholder?: string; required?: boolean }
  | { kind: 'number'; key: string; label: string; min?: number; max?: number; step?: number }
  | { kind: 'boolean'; key: string; label: string }
  | { kind: 'select'; key: string; label: string; options: { value: string; label: string }[] }
  | { kind: 'theme-token'; key: string; label: string }
  | { kind: 'json'; key: string; label: string; placeholder?: string }

/**
 * Background-slot mounting strategies.
 *
 * - `per-unit` (default): the slot mounts one instance per unique stableIdentity,
 *   feeds it the active unit's config via `VizRenderProps`, and toggles
 *   `visibility` when the active unit doesn't reference this instance. Good for
 *   lightweight viz types (image, video, embed) where each unit's config
 *   is self-contained.
 * - `persistent-aggregated`: the slot mounts ONE instance for the whole story
 *   and feeds it every unit's config at once via `VizPersistentRenderProps`.
 *   Required for the map module — Mapbox disposal is expensive enough that we
 *   keep the single WebGL context alive and derive camera state from `activeUnit`.
 */
export type VizMountingMode = 'per-unit' | 'persistent-aggregated'

export interface VizModule<TConfig = unknown> {
  type: string
  label: string
  slots: readonly VizSlot[]
  parseConfig: (raw: unknown, ctx: { slug: string; label: string }) => TConfig
  load: () => Promise<{ default: ComponentType<VizRenderProps<TConfig>> }>
  /** Variant component for `persistent-aggregated` mounting. Required when `mountingMode === 'persistent-aggregated'`. */
  loadPersistent?: () => Promise<{ default: ComponentType<VizPersistentRenderProps<TConfig>> }>
  /** How the slot mounts this module. Defaults to `'per-unit'`. */
  mountingMode?: VizMountingMode
  introspect?: (config: TConfig, opts: { assetUrl: string }) => Promise<unknown>
  adminForm?: (config: TConfig | null) => AdminFormField[]
  readinessProfile?: 'instant' | 'first-paint' | 'tiles-then-settle'
  collectAssetKeys?: (config: TConfig) => string[]
  /** Deterministic identity string used by BackgroundVizSlot to dedupe persistent instances. */
  stableIdentity?: (config: TConfig) => string
}
