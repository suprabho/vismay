import type { CSSProperties, ComponentType, RefObject } from 'react'

export type VizSlot = 'foreground' | 'background'

/**
 * Identifier for a named region inside a foreground layout (e.g. 'lead',
 * 'chart', 'body'). Authors slot modules into regions; regions exist only
 * within the foreground container — `VizSlot` stays binary so the registry
 * and background dispatch don't need to learn about region semantics.
 */
export type ForegroundRegionName = string

/**
 * One named region inside a `ForegroundLayoutDef`. The layout slot renders an
 * absolutely-positioned wrapper per region using `style`, then mounts the
 * region's foreground layers inside.
 */
export interface ForegroundLayoutRegion {
  /** CSS positioning + sizing for the region's wrapper box. Applied as inline style. */
  style: CSSProperties
  /** Optional viz-type allowlist. Empty/omitted = any module that lists 'foreground' in `slots`. */
  accepts?: readonly string[]
  /** Authoring hints used by the admin form / preview. Not enforced at runtime. */
  hints?: { aspect?: 'auto' | 'square' | 'wide' | 'tall'; minHeight?: string }
}

/**
 * A reusable foreground composition. Defines the named regions that make up
 * the layout and the CSS box for each. Layouts register at startup
 * (`registerForegroundLayout`) — verticals can ship their own without
 * touching core, mirroring how `registerVizModule` works.
 *
 * `portrait` is the variant used when `useIsMobile()` is true; falls back
 * to the landscape definition when omitted.
 */
export interface ForegroundLayoutDef {
  name: string
  regions: Record<ForegroundRegionName, ForegroundLayoutRegion>
  portrait?: ForegroundLayoutDef
}

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
  /**
   * Optional list of region names this module is best suited to. Used by the
   * admin form to guide authors when picking where to drop a module — not
   * enforced at runtime (the layout's per-region `accepts` allowlist is the
   * authoritative gate).
   */
  regionPreferences?: readonly ForegroundRegionName[]
}
