// Pure type definitions for story configs. No runtime imports — safe for
// client components to import without dragging fs/path into the bundle.

import type { MapRegionLayer, HeatmapLayer, MapTextLabel } from '../types/story'
import type { VizLayer, VizLayerStyle, VizLayerPanel, VizRef } from '../types'

export type { VizLayer, VizLayerStyle, VizLayerPanel, VizRef }

/** A whole-slot opt-out (e.g. `background: { type: 'none' }`). */
export interface VizSlotNone {
  type: 'none'
}

/**
 * Region-aware foreground input. Authors declare a layout name (resolved via
 * the `foregroundLayouts` registry) and a map from region name to its layer
 * stack. A single `VizLayer` per region is sugar for a one-element array.
 */
export interface ForegroundRegionsInput {
  layout: string
  regions: Record<string, VizLayer | VizLayer[]>
}

export type ForegroundSlotInput = VizLayer | VizLayer[] | ForegroundRegionsInput
export type BackgroundSlotInput = VizLayer | VizLayer[] | VizSlotNone

/**
 * Per-category show/hide/recolor override.
 *
 *   undefined | false → hide the category (Mapbox `visibility: none`)
 *   true              → show using the base style's own color
 *   string            → show, overriding the color with this value
 *
 * Used for label and road categories that are hidden by default to keep the
 * background map quiet underneath the story. A per-story config can opt
 * specific categories back in.
 */
export type LayerOverride = boolean | string

/**
 * Semantic color overrides applied on top of the base Mapbox style at runtime.
 * Each field maps to a group of layers in the style (by id pattern + type),
 * so you can restyle a stock Mapbox template to match the story's palette
 * without forking the style in Studio.
 *
 * Color fields (land/water/etc) are optional — unset keeps the base style.
 * Label and road category fields default to **hidden**; a value opts them in.
 * Colors must be concrete (hex, rgb, hsl) — Mapbox doesn't accept CSS vars.
 */
export interface MapPalette {
  /** Base map background color — applies to `background` + `land` layers. */
  land?: string
  /** Water fill color — applies to `water`, `water-shadow`, `waterway-*` fills. */
  water?: string
  /** Country/state border line color — applies to `admin-*-boundary[-bg]` lines. */
  border?: string
  /** Text fill for every visible symbol layer with a `text-field`. */
  labelText?: string
  /** Text halo (outline) for every visible symbol layer with a `text-field`. */
  labelHalo?: string
  /** 3D/2D building fill color. */
  building?: string

  /** Country / state / settlement / place labels. Hidden by default. */
  placeLabels?: LayerOverride
  /** Road / street name labels. Hidden by default. */
  roadLabels?: LayerOverride
  /** Transit (bus / subway / rail) labels. Hidden by default. */
  transitLabels?: LayerOverride
  /** POI + airport labels. Hidden by default. */
  poiLabels?: LayerOverride

  /** Motorways / highways (road-motorway*, matching bridge/tunnel casings). Hidden by default. */
  motorways?: LayerOverride
  /** Trunk roads (road-trunk*). Hidden by default. */
  trunkRoads?: LayerOverride
  /** Other roads: primary/secondary/tertiary/minor/street/service. Hidden by default. */
  minorRoads?: LayerOverride
  /** Pedestrian paths, footways, steps. Hidden by default. */
  pedestrianPaths?: LayerOverride
}

/**
 * Page-level backdrop config. Used by the deck format to mount a single
 * persistent backdrop behind every section. Resolution order in the page
 * route: `defaults.storyBackground` → frontmatter `aura` → `{ type: 'none' }`.
 *
 * The aura variant mounts the same embed used by the home tile; tint applies
 * a CSS-multiply layer above the aura so the SpaceX-style deep-space palette
 * stays coherent.
 */
export type StoryBackgroundConfig =
  | {
      type: 'aura'
      slug: string
      /** Whether the aura embed reacts to audio input. Defaults to off in deck context. */
      input?: 'on' | 'off'
      /** CSS color cast applied above the aura via a blend mode. */
      tint?: string
      /**
       * Blend mode for the tint layer. Mirrors CSS `mix-blend-mode`. Defaults
       * to `multiply` when `tint` is set.
       */
      tintBlendMode?: 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'difference' | 'normal'
      /** When true, the backdrop stays pinned while the page scrolls. Defaults to true. */
      fixed?: boolean
    }
  | {
      type: 'image'
      src: string
      fit?: 'cover' | 'contain' | 'fill'
      position?: string
    }
  | { type: 'color'; value: string }
  | { type: 'none' }

/**
 * Optional darken/tint overlay painted between the story background and the
 * foreground content. Critical for chart legibility over busy aura motion in
 * the deck format.
 */
export interface OverlayConfig {
  /** Solid color floor. Combined with `opacity` if both set. */
  color?: string
  /** 0..1. Applied to `color` when no gradient is supplied. */
  opacity?: number
  /** Optional radial/linear gradient layered above `color`. */
  gradient?: {
    type: 'radial' | 'linear'
    from: string
    to: string
    /** Linear angle (deg) or CSS direction (`to bottom`). Ignored for radial. */
    angle?: string
  }
}

/**
 * Deck-specific scroll behavior. `snap` produces a slide-deck feel where each
 * section is one viewport-tall snap target; `continuous` is cinematic scroll.
 */
export interface DeckScrollConfig {
  mode: 'snap' | 'continuous'
  paddingY?: string
}

/**
 * Story-wide defaults for chart appearance. Forwarded to the chart module's
 * render path so individual chart JSONs don't need to repeat theme/grid.
 */
export interface ChartDefaults {
  theme?: string
  grid?: {
    left?: number | string
    right?: number | string
    top?: number | string
    bottom?: number | string
  }
}

/**
 * Per-section override of the persistent Vizmaya logo Rive's colors. Each value
 * is a theme token (`"$accent"`, `"$teal"`, … — resolved against the active theme
 * via `resolveSectionLogoPalettes`) or a concrete hex (`"#d8804a"`). Slots map to
 * the `.riv` view-model bindings (text→textColor, teal→tealColor, accent→accentColor,
 * accent2→accent2Color, surface→surfaceColor, muted→mutedColor, line→lineColor).
 * Unset slots inherit: section override → story-wide `defaults.logoPalette` → theme.
 */
export interface LogoPalette {
  text?: string
  teal?: string
  accent?: string
  accent2?: string
  surface?: string
  muted?: string
  line?: string
}

export interface StoryDefaults {
  mapStyle: string
  mapOpacity: number
  pinColor: string
  pinRadius: number
  flySpeed: number
  /** Optional ISO 3166-1 alpha-2 country code to highlight on the map (e.g. "KR"). */
  highlightCountry?: string
  /** Override color for the country highlight. Defaults to pinColor. */
  highlightColor?: string
  /** Per-story semantic color overrides applied to the base Mapbox style. */
  mapPalette?: MapPalette
  /**
   * Optional Mapbox fontstack to apply to every text layer. Must reference
   * fonts that exist on the `glyphs:` URL of the active style (i.e. uploaded
   * to Mapbox Studio under your account, e.g. `["Vizmaya Serif Regular"]`).
   */
  mapFontstack?: string[]
  /**
   * Page-level backdrop for the deck format. Mounts once at the page level
   * (outside the snap container) and persists across every section. When
   * absent, the page route falls back to `frontmatter.aura` for deck stories
   * and to `{ type: 'none' }` for map stories.
   */
  storyBackground?: StoryBackgroundConfig
  /** Darken/tint layer between the story background and the foreground content. */
  overlay?: OverlayConfig
  /**
   * Default frosted-glass styling for every foreground panel. Each vizslot
   * inherits this unless its `style.panel` overrides per-field. Used by the
   * deck format to apply a coherent card frame across the whole story.
   */
  panel?: VizLayerPanel
  /** Deck scroll mode + viewport padding. Currently advisory; honored by the deck shell. */
  scroll?: DeckScrollConfig
  /** Story-wide chart defaults (theme + grid). Forwarded to the chart module. */
  chart?: ChartDefaults
  /**
   * When true, the deck shell mounts a fixed right-edge step indicator
   * (one hairline per snap unit, active one wider/darker) and a clickable
   * jump-to-section affordance. Off by default so existing deck stories
   * keep the cleaner empty edges.
   */
  progress?: boolean
  /**
   * Story-wide base override for the persistent Vizmaya logo Rive's colors.
   * Applied on top of the theme palette; individual sections layer their own
   * `logoPalette` over this. Values are theme tokens (`"$accent"`) or hex.
   */
  logoPalette?: LogoPalette
}

export interface MapPinConfig {
  coordinates: [number, number]
  color?: string
  label?: string
  radius?: number
  pulse?: boolean
  /** Preferred popup anchor direction. Controls which side of the pin the label appears on. */
  labelAnchor?: 'top' | 'bottom' | 'left' | 'right'
  /**
   * Optional image rendered inside the pin (circular crop). Accepts an
   * `assets://<key>` reference, an absolute `http(s)` URL, or a same-origin
   * `/path`. When set, `color` becomes the ring around the image.
   */
  image?: string
}

/**
 * Section presentation kind. The original triple (`text` | `hero` | `stat`)
 * drives the map-format text card. Deck-format aliases expand the vocabulary
 * for slide composition:
 *
 *   cover    ≈ hero    (large title slide)
 *   bigStat  ≈ stat    (giant number slide — but composed via a `bigStat`
 *                       foreground vizslot, not the section text card)
 *   bodyText ≈ text    (prose slide composed via a `bodyText` vizslot)
 *
 * The remaining values (`split` | `data` | `gallery` | `quote` | `divider` |
 * `closing`) are deck-only compositional kinds. The deck shell suppresses the
 * section text card for all kinds except `cover`/`hero`; the visual is
 * carried by the section's foreground vizslots in their layout regions.
 */
export type SectionKind =
  | 'text'
  | 'hero'
  | 'stat'
  | 'cover'
  | 'bigStat'
  | 'bodyText'
  | 'split'
  | 'data'
  | 'gallery'
  | 'quote'
  | 'divider'
  | 'closing'

/**
 * Theme palette token used to color a `kind: stat` panel's giant number.
 * Each value maps to a CSS variable emitted by `ThemeProvider`
 * (e.g. `red` → `var(--color-red)`). Tokens like `background` / `surface` /
 * `text` are intentionally excluded — they don't read as a foreground accent.
 */
export type StatColor =
  | 'accent'
  | 'accent2'
  | 'red'
  | 'positive'
  | 'amber'
  | 'teal'
  | 'muted'

export interface MapOverrides {
  center?: [number, number]
  zoom?: number
  pitch?: number
  bearing?: number
  opacity?: number
  flySpeed?: number
  pins?: MapPinConfig[]
  /** Optional choropleth layer. Replaces (does not merge) the parent's regions. */
  regions?: MapRegionLayer
  /** Optional heatmap layer. Replaces (does not merge) the parent's heatmap. */
  heatmap?: HeatmapLayer
  /** Free-floating text labels (no pin marker beneath). Replaces the parent's textLabels. */
  textLabels?: MapTextLabel[]
}

export interface SubsectionMapOverride extends MapOverrides {
  /** Overrides applied on portrait / mobile viewports. */
  mobile?: MapOverrides
}

export interface StorySubsectionConfig {
  id?: string
  /** Markdown anchor reference (e.g. "Act II > The misleading spike") */
  text: string
  /**
   * Optional 0-based slice into the resolved paragraphs of `text`.
   * When set, only that paragraph(s) is shown — used to reveal bullets one
   * at a time as the chart's `activeStep` advances. Examples:
   *   paragraphs: 0       → show only the first paragraph
   *   paragraphs: [0, 2]  → show paragraphs at indices 0..2 (inclusive end? no — 0..1)
   *   omit                → show all paragraphs (legacy behaviour)
   * Use [start, end] semantics matching Array.slice (end is exclusive).
   */
  paragraphs?: number | [number, number]
  /**
   * Mobile-only paragraph slices. When present on a portrait viewport, a
   * single desktop subsection expands into multiple snap targets — one per
   * entry. Each entry follows the same `[start, end]` semantics as
   * `paragraphs`. This avoids text overflow on small screens.
   *
   * Example:
   *   paragraphs: [0, 8]           # desktop — one snap
   *   mobileParagraphs:            # mobile — two snaps
   *     - [0, 4]
   *     - [4, 8]
   */
  mobileParagraphs?: Array<number | [number, number]>
  /**
   * Share-mode paragraph slices. When present, a single desktop subsection
   * expands into multiple share cards — one per entry. Each entry follows
   * the same `[start, end]` semantics as `paragraphs`.
   *
   * Example:
   *   paragraphs: [0, 6]           # desktop — one snap
   *   shareParagraphs:             # share — two cards
   *     - [0, 3]
   *     - [3, 6]
   */
  shareParagraphs?: Array<number | [number, number]>
  /** Optional override heading shown above the paragraphs (replaces the anchor's own heading). */
  heading?: string
  /** Optional short label displayed below the stat number (kind: stat only). */
  subheading?: string
  /**
   * Optional partial map override. Fields provided here replace the
   * corresponding field from the parent section's `map`. `pins` replaces
   * the entire pin array (does not merge) so you can progressively reveal
   * markers per step.
   */
  map?: SubsectionMapOverride
}

export interface StorySectionConfig {
  id?: string
  /** What kind of foreground panel to render. Defaults to 'text'. */
  kind?: SectionKind
  /**
   * Markdown anchor reference for the section's text panel.
   * Required UNLESS `subsections` is provided (in which case each subsection
   * carries its own text reference and the parent's `text` is ignored).
   */
  text?: string
  /**
   * Optional list of child subsections. When present, each subsection becomes
   * its own viewport-tall snap target. All subsections share the parent's
   * map state and chart, and their index drives the chart's activeStep
   * (so chart animations resume from where the previous subsection left off).
   */
  subsections?: StorySubsectionConfig[]
  /** Same paragraph-slice semantics as StorySubsectionConfig.paragraphs. */
  paragraphs?: number | [number, number]
  /** Same mobile-split semantics as StorySubsectionConfig.mobileParagraphs. */
  mobileParagraphs?: Array<number | [number, number]>
  /** Same share-split semantics as StorySubsectionConfig.shareParagraphs. */
  shareParagraphs?: Array<number | [number, number]>
  /** Optional override heading for the section's text panel. */
  heading?: string
  /** Optional short label displayed below the stat number (kind: stat only). */
  subheading?: string
  /** Optional foreground chart id; resolved by ChartPanel registry. Legacy — prefer `foreground`. */
  chart?: string
  /** Optional eyebrow line shown above the hero title (kind: hero only). */
  eyebrow?: string
  /** Theme palette token for the stat number's color (kind: stat only). Defaults to `accent2`. */
  color?: StatColor
  /**
   * Persistent backdrop layer stack. When absent and `map` is set, the back-compat
   * shim in `resolveSlots()` synthesizes a single-element map layer array. When set to
   * `{ type: 'none' }`, the persistent map is suppressed for this section.
   */
  background?: BackgroundSlotInput
  /**
   * Per-unit foreground layer stack. When absent and `chart` is set, the shim
   * synthesizes a single-element chart layer array.
   */
  foreground?: ForegroundSlotInput
  /**
   * Section-root layout name. Sugar for `foreground: { layout, regions }` when
   * the section's `foreground:` is an unwrapped array (deck format). When both
   * `section.layout` and `foreground.layout` are set, `foreground.layout` wins.
   * Resolved against the `foregroundLayouts` registry.
   */
  layout?: string
  /**
   * Per-section panel chrome override. Merged shallowly over `defaults.panel`
   * (story-wide) which is itself merged over each vizslot's module default.
   * Authors use this to swap the frame style on a single hero/closing slide
   * without touching the deck-wide defaults.
   */
  panel?: VizLayerPanel
  /**
   * Per-section override for the persistent Vizmaya logo Rive's colors. Merged
   * over `defaults.logoPalette` (story-wide) which is itself merged over the
   * theme palette. As the reader scrolls into this section the logo re-tints.
   * Values are theme tokens (`"$accent"`, `"$teal"`) or concrete hex.
   */
  logoPalette?: LogoPalette
  /**
   * Legacy map field. Optional in the type because the deck format never sets
   * it and the loader/back-compat shims already tolerate its absence. For map
   * stories it's effectively required — the loader's per-section validator
   * enforces `map.center` + `map.zoom` when neither `background:` nor
   * `foreground:` is declared.
   */
  map?: {
    center: [number, number]
    zoom: number
    pitch?: number
    bearing?: number
    opacity?: number
    flySpeed?: number
    pins?: MapPinConfig[]
    regions?: MapRegionLayer
    heatmap?: HeatmapLayer
    /** Free-floating text labels (no pin marker beneath). */
    textLabels?: MapTextLabel[]
    /** Overrides applied on portrait / mobile viewports. */
    mobile?: MapOverrides
  }
}

export interface StoryConfig {
  defaults: StoryDefaults
  sections: StorySectionConfig[]
}

/* ─── Share mode config ─────────────────────────────────────────── */

/**
 * Per-section overrides for share mode, keyed by section `id`.
 * Only the fields provided are merged — everything else falls back
 * to the main story config.
 */
/**
 * Per-subsection overrides for share mode, keyed by the subsection's
 * zero-based index within its parent section's `subsections` array.
 *
 * Use this when a parent section has multiple subsections and you need
 * to rewrite one without touching the others (e.g. shortening only the
 * "Oil: 70%" subsection's copy for a share card).
 */
/**
 * Per-card visibility toggles for map data layers. `undefined` means inherit
 * from the resolved layer set; `false` suppresses that layer on this card;
 * `true` is equivalent to `undefined` and is accepted for symmetry.
 */
export interface ShareLayerVisibility {
  pins?: boolean
  regions?: boolean
  heatmap?: boolean
}

/**
 * Per-chart-card text overrides. Lives in its own slot so chart cards can
 * carry a heading and subheading without colliding with the map-title or
 * content cards that share the same section/subsection scope.
 */
export interface ShareChartOverride {
  heading?: string
  subheading?: string
}

/** Alias used for variant-scoped text slots that mirror the chart shape. */
export type ShareTextOverride = ShareChartOverride

/**
 * Per-hero-card text overrides. Adds `dek` (the paragraph below the title)
 * so the hero card can carry its own supporting copy independent of the
 * map-title overlay or any other variant emitted from the same section.
 */
export interface ShareHeroOverride {
  heading?: string
  subheading?: string
  dek?: string
}

/**
 * Per-stat-card text overrides. Only `description` lives here for now —
 * the stat card's big value and small label fall back to the section's bare
 * `heading` / `subheading`, which keeps simple yaml short.
 */
export interface ShareStatOverride {
  description?: string
}

/**
 * Thin patch over a single resolved pin, keyed by the pin's `label` text in
 * the parent override map. Only the fields a share-card author commonly
 * tweaks per-aspect; the pin's coordinates and label text stay inherited.
 */
export interface MapPinOverride {
  color?: string
  radius?: number
  pulse?: boolean
  labelAnchor?: 'top' | 'bottom' | 'left' | 'right'
  /** When true, the pin is suppressed entirely on this card (marker + label). */
  hidden?: boolean
}

/**
 * Aspect-ratio key for per-aspect map framing overrides. Matches
 * `AspectRatio` in `components/share/AspectRatioToggle.tsx`. Re-declared
 * here as a string union so this types-only module stays free of
 * component imports.
 */
export type ShareAspectRatio = '1:1' | '4:5' | '3:4' | '4:3'

/**
 * Per-aspect camera override. Only framing fields (center/zoom/pitch/bearing)
 * are aspect-specific — the underlying map data (pins, regions, heatmap,
 * textLabels) is shared across all aspects on the same card.
 *
 * Applied on top of the base map override's same fields. Unset fields fall
 * through to the base override, then the story config cascade.
 */
export interface ShareMapAspectOverride {
  center?: [number, number]
  zoom?: number
  pitch?: number
  bearing?: number
}

export interface ShareSubsectionOverride {
  /**
   * Literal replacement paragraphs for this subsection's share card(s).
   * Each entry becomes one card:
   *   - a `string` is a card with a single paragraph
   *   - a `string[]` is a card with multiple stacked paragraphs
   * Takes precedence over `shareParagraphs` when both are set.
   */
  paragraphsOverride?: Array<string | string[]>
  /** Same `shareParagraphs` semantics as the parent override, scoped to this subsection. */
  shareParagraphs?: Array<number | [number, number]>
  /** Override the heading shown on this subsection's cards. */
  heading?: string
  /** Override the subheading (stat label / map-title sublabel). */
  subheading?: string
  /** Per-card layer toggles. Falsy entries suppress that layer. */
  layers?: ShareLayerVisibility
  /** Heading/subheading shown on the chart card for this subsection. */
  chart?: ShareChartOverride
  /** Heading / subheading / dek shown on the map-title overlay for this subsection. `dek` only renders on `kind: hero` sections; falls back to `hero.dek`. */
  mapTitle?: ShareHeroOverride
  /** Title / subheading / dek shown on the standalone hero card for this subsection. */
  hero?: ShareHeroOverride
  /** Description body text on the standalone stat card for this subsection. Falls back to the joined paragraphs. */
  stat?: ShareStatOverride
  /** Hide the body PretextBlock on this subsection's text card(s). */
  hidePretext?: boolean
  /**
   * Thin patch over the parent's `regions.labels.codes` allowlist for this
   * card only. When defined (even if empty), it REPLACES the parent's
   * allowlist; the rest of the regions config (items, ramp, colors) is
   * inherited. Use `map.regions` for a full replacement.
   */
  regionLabelCodes?: string[]
  /**
   * Per-pin patches keyed by the pin's `label` text. Each value is a thin
   * patch (color / radius / pulse / labelAnchor) merged onto the resolved
   * pin. Pins without a matching key inherit unchanged.
   */
  pinOverrides?: Record<string, MapPinOverride>
  /** Map override for this subsection's share cards (full set, including regions/heatmap). */
  map?: {
    center?: [number, number]
    zoom?: number
    pitch?: number
    bearing?: number
    pins?: MapPinConfig[]
    regions?: MapRegionLayer
    heatmap?: HeatmapLayer
    textLabels?: MapTextLabel[]
    /**
     * Per-aspect camera framing. Each key's fields override the base camera
     * for that aspect only; unset fields fall through to the base map
     * override, then to the story-config cascade.
     */
    ratios?: Partial<Record<ShareAspectRatio, ShareMapAspectOverride>>
  }
}

export interface ShareSectionOverride {
  /** Override the heading shown on the map-title card. */
  heading?: string
  /** Override the subheading shown beneath the heading. */
  subheading?: string
  /** Hide this section from share mode entirely. */
  hide?: boolean
  /** Per-card layer toggles. Falsy entries suppress that layer. */
  layers?: ShareLayerVisibility
  /** Heading/subheading shown on this section's chart card(s). Falls back to per-subsection `chart` override. */
  chart?: ShareChartOverride
  /** Heading / subheading / dek shown on this section's map-title overlay card(s). `dek` only renders on `kind: hero` sections; falls back to `hero.dek`. */
  mapTitle?: ShareHeroOverride
  /** Title / subheading / dek shown on this section's standalone hero card(s). Falls back to per-subsection `hero` override. */
  hero?: ShareHeroOverride
  /** Description body text on this section's standalone stat card(s). Falls back to per-subsection `stat` then the joined paragraphs. */
  stat?: ShareStatOverride
  /** Hide the body PretextBlock on this section's text card(s). */
  hidePretext?: boolean
  /**
   * Override paragraph slices for share mode. When present, a single section
   * expands into multiple share cards — one per entry. Each entry follows
   * the same `[start, end]` semantics as `paragraphs`.
   */
  shareParagraphs?: Array<number | [number, number]>
  /**
   * Literal replacement paragraphs for this section's share card(s).
   * Same semantics as `ShareSubsectionOverride.paragraphsOverride`.
   * Takes precedence over `shareParagraphs` when both are set. Does NOT
   * target subsections — use `subsections` for per-subsection rewrites.
   */
  paragraphsOverride?: Array<string | string[]>
  /**
   * Per-subsection overrides, keyed by the subsection's zero-based index
   * within the parent section's `subsections` array in the main config.
   * When a subsection override is present for a unit, it takes precedence
   * over the section-level `paragraphsOverride` / `shareParagraphs`.
   */
  subsections?: Record<number, ShareSubsectionOverride>
  /**
   * Thin patch over the parent's `regions.labels.codes` allowlist for this
   * section's cards. Same semantics as `ShareSubsectionOverride.regionLabelCodes`.
   */
  regionLabelCodes?: string[]
  /**
   * Per-pin patches keyed by the pin's `label` text. Same semantics as
   * `ShareSubsectionOverride.pinOverrides`.
   */
  pinOverrides?: Record<string, MapPinOverride>
  map?: {
    center?: [number, number]
    zoom?: number
    pitch?: number
    bearing?: number
    pins?: MapPinConfig[]
    regions?: MapRegionLayer
    heatmap?: HeatmapLayer
    textLabels?: MapTextLabel[]
    /**
     * Per-aspect camera framing. Each key's fields override the base camera
     * for that aspect only; unset fields fall through to the base map
     * override, then to the story-config cascade.
     */
    ratios?: Partial<Record<ShareAspectRatio, ShareMapAspectOverride>>
  }
}

export interface ShareConfig {
  /**
   * Story-wide logo shown in the top-right of every share card. Path under
   * `/public` (e.g. `/vizmaya-logo-04.svg`) or an absolute URL. Falls back
   * to the default Vizmaya logo when omitted.
   */
  logo?: string
  sections: Record<string, ShareSectionOverride>
}

/**
 * A renderable unit — one viewport-tall snap target. Sections without
 * subsections produce one unit; sections with N subsections produce N units.
 *
 * `parentIndex` indexes into the original `config.sections` array (and into
 * `mapSteps`), so multiple units with the same parentIndex share the map
 * camera position and the chart instance.
 *
 * `subIndex` is the unit's position within its parent (0 if no subsections),
 * and is what gets passed to the chart as `activeStep`.
 *
 * Pure primitives — safe to serialize from a server component into a client one.
 */
export interface ResolvedUnit {
  parentIndex: number
  subIndex: number
  parentConfig: StorySectionConfig
  heading: string | undefined
  subheading: string | undefined
  paragraphs: string[]
  /**
   * Mobile-only: hero kind splits into two scroll-snap sections (title, then
   * dek+byline). `heroPart` identifies which half this mobile unit renders.
   * Undefined for desktop units and for non-hero kinds.
   */
  heroPart?: 'title' | 'dek'
  /**
   * Mobile-only: when a desktop unit expands into multiple mobile units
   * (via `mobileParagraphs` or hero title/dek split), `sliceIndex` is the
   * 0-based position of this mobile unit within that expansion. Always 0
   * for desktop units and for non-split mobile units. Used as the third
   * coordinate of mobile unit identity by lib/storyTts.ts so per-unit
   * overrides survive content tweaks within the same section.
   */
  sliceIndex?: number
}
