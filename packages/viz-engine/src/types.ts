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
  /**
   * When true, the slots in this layout's `default` region flow full-width and
   * vertically (in declaration order) on portrait instead of keeping their
   * authored `%`/`vw` widths side-by-side. Set on the deck "free" layouts
   * (text-left-chart-right, stat-left-chart-right, …) where slots self-position
   * via `style`. Left unset on hero-full-bleed / single-fill / split-37-63-two-row,
   * which either fill the region or already restack via a `portrait` region variant.
   */
  stackOnPortrait?: boolean
}

export interface VizCaptureHandle {
  freeze: () => Promise<void> | void
  resume?: () => void
}

/**
 * Optional chrome rendered around a layer's wrapper box. Every field is
 * forwarded straight to CSS, so the full vocabulary (theme vars, gradients,
 * oklch, calc(), …) is available — no DSL.
 *
 * Authors typically set this on text/image layers that want a card frame; the
 * text module ships sensible defaults via `VizModule.defaultStyle.panel`, and
 * any field set here overrides the module default.
 */
export interface VizLayerPanel {
  /** CSS `background` shorthand — color, gradient, rgb()/oklch with var(), … */
  background?: string
  /** CSS `border` shorthand. */
  border?: string
  /** CSS `border-radius` (e.g. '8px', '0.5rem'). */
  borderRadius?: string
  /** CSS `padding` shorthand. */
  padding?: string
  /** Radius for `backdrop-filter: blur(<value>)`. */
  backdropBlur?: string
  /** CSS `box-shadow` shorthand. */
  shadow?: string
}

export interface VizLayerStyle {
  position?: { x?: 'left' | 'center' | 'right' | string; y?: 'top' | 'center' | 'bottom' | string }
  size?: { width?: string; height?: string }
  opacity?: number
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'difference'
  pointerEvents?: 'auto' | 'none'
  zIndex?: number
  /** Optional chrome around the layer's wrapper box. */
  panel?: VizLayerPanel
  /**
   * Per-slot overrides applied when `useIsMobile()` is true (portrait). Shallow-
   * merged over the base style — e.g. `portrait: { size: { height: '38vh' } }`
   * to tune a chart's stacked height, or `portrait: { opacity: 0 }` to drop a
   * slot on mobile. A nested `portrait` is ignored.
   */
  portrait?: VizLayerStyle
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
  /**
   * Worked YAML examples for `adminForm` `json` fields — the nested shapes the
   * field descriptor can't fully spell out (e.g. a table's `columns`/`rows`).
   * Keyed by the field's `key`; each value is the field's YAML *value* as it
   * should appear (multi-line block or inline). Consumed by the schema-aware
   * AI prompt builder (`buildLayerSchemaPrompt`) so generated YAML matches the
   * exact nested shape `parseConfig` accepts. Optional — primitive fields are
   * derived from `adminForm` alone.
   */
  aiFieldExamples?: Record<string, string>
  readinessProfile?: 'instant' | 'first-paint' | 'tiles-then-settle'
  collectAssetKeys?: (config: TConfig) => string[]
  /** Deterministic identity string used by BackgroundVizSlot to dedupe persistent instances. */
  stableIdentity?: (config: TConfig) => string
  /**
   * Module-level default for `VizLayer.style`. Merged shallowly under any
   * `style` the author sets on the layer — per-field, so a YAML `style.panel`
   * overrides only the panel default while leaving e.g. `pointerEvents`
   * unchanged. Use this to ship sensible chrome (text panels get a card frame
   * by default) without forcing every YAML to repeat it.
   */
  defaultStyle?: VizLayerStyle
  /**
   * Optional list of region names this module is best suited to. Used by the
   * admin form to guide authors when picking where to drop a module — not
   * enforced at runtime (the layout's per-region `accepts` allowlist is the
   * authoritative gate).
   */
  regionPreferences?: readonly ForegroundRegionName[]
}
