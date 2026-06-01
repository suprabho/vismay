export interface Theme {
  colors: {
    background: string
    text: string
    accent: string
    accent2: string
    teal: string
    surface: string
    muted: string
    positive?: string
    amber?: string
    red?: string
    line?: string
  }
  fonts: {
    serif: string
    sans: string
    mono: string
  }
}

export type StoryStatus = 'draft' | 'published' | 'archived'

/**
 * Top-level renderer discriminator. Missing = 'map' so every existing story
 * keeps rendering through the map-anchored shell unchanged.
 *
 * - `map`: legacy map-anchored scrollytelling. Every section has its own
 *   `map:` camera state; foreground vizslots float over a persistent Mapbox
 *   instance.
 * - `deck`: snap-scrolled slide deck over a page-level aura backdrop.
 *   Sections are slides composed of foreground vizslots in regions; the
 *   `defaults.storyBackground` mounts once at the page level.
 */
export type StoryFormat = 'map' | 'deck'

export interface Frontmatter {
  title: string
  subtitle: string
  byline: string
  date: string
  theme: Theme
  /** Publication state. Missing = 'published' (backwards compatible). */
  status?: StoryStatus
  /** Whether the story appears on the home grid. Missing = true. */
  listed?: boolean
  /** Aura embed slug (https://aura.promad.design/embed/<slug>) used as the home tile background. */
  aura?: string
  /**
   * Editorial topic (e.g. "Energy", "Politics", "Markets"). Optional — when
   * present, the home page surfaces it as a card pill and a rail filter chip.
   */
  topic?: string
  /**
   * Vertical bundle to load for this story. When set, the page loads the
   * matching `components/story/viz/verticals/<vertical>/` module bundle so
   * its viz types are available to the registry. Unknown verticals are
   * ignored with a console warning. See `components/story/viz/verticals.ts`.
   */
  vertical?: string
  /**
   * Renderer format. Missing = 'map' (legacy default). See `StoryFormat`.
   * The page route branches on this to mount either the map-anchored shell
   * or the deck shell.
   */
  format?: StoryFormat
  /**
   * Optional cover image URL shown as the home page card thumbnail background.
   * Accepts absolute `http(s)` URLs or same-origin `/path` references.
   * The theme's solid background color remains visible beneath the image.
   */
  thumbnail?: string
}

export type BlockType =
  | 'hero'
  | 'stat-block'
  | 'act-header'
  | 'divider'
  | 'prose'
  | 'subsection-header'
  | 'data-table'
  | 'exposure-grid'
  | 'scrolly-section'
  | 'scenario-toggle'
  | 'takeaway-grid'
  | 'methodology'
  | 'footer'
  | 'unknown'

export interface HeroBlock {
  type: 'hero'
  title: string
  dek: string
  byline: string
}

export interface StatBlock {
  type: 'stat-block'
  value: string
  description: string
}

export interface ActHeaderBlock {
  type: 'act-header'
  actNumber: string
  title: string
}

export interface DividerBlock {
  type: 'divider'
}

export interface ProseBlock {
  type: 'prose'
  paragraphs: string[]
}

export interface SubsectionHeaderBlock {
  type: 'subsection-header'
  title: string
}

export interface TableRow {
  cells: string[]
}

export interface DataTableBlock {
  type: 'data-table'
  headers: string[]
  rows: string[][]
  scenarioLabel?: string
}

export interface ExposureItem {
  label: string
  value: string
  description: string
  color?: string
}

export interface ExposureGridBlock {
  type: 'exposure-grid'
  items: ExposureItem[]
}

export interface ScrollStep {
  label: string
  content: string
}

export interface MapPin {
  coordinates: [number, number]
  color?: string
  label?: string
  radius?: number
  opacity?: number
  pulse?: boolean
  /** Preferred popup anchor direction. Controls which side of the pin the label appears on. */
  labelAnchor?: 'top' | 'bottom' | 'left' | 'right'
  /**
   * Optional image rendered inside the pin (circular crop). Accepts the same
   * references as other assets: `assets://<key>`, an absolute `http(s)` URL, or
   * a same-origin `/path`. When set, `color` becomes the ring around the image.
   */
  image?: string
}

/**
 * A single region in a choropleth. Either supply an explicit `color`, or a
 * `value` that gets mapped through the layer's `ramp` to a color.
 */
export interface MapRegion {
  /** ISO 3166-1 alpha-2 (level: country) or the feature id (level: custom). */
  code: string
  /** Explicit fill color. Overrides the ramp. */
  color?: string
  /** Fill opacity (0..1). Defaults to 0.55. */
  opacity?: number
  /** Numeric value used to drive the ramp when `color` is omitted. */
  value?: number
  /** Optional label (used by future hover logic; safe to omit). */
  label?: string
}

export type MapRegionLevel = 'country' | 'custom'

/**
 * Optional pill background drawn behind each region label. Rendered as a
 * stretchable Mapbox icon so the rounded corners stay crisp at any text
 * width and Mapbox's text-fit machinery does the sizing.
 */
export interface MapLabelBackground {
  /** Fill color (theme token "$surface" or hex). Defaults to "$bg". */
  color?: string
  /** Fill opacity (0..1). Defaults to 1 (fully opaque). */
  opacity?: number
  /** Padding inside the pill, `[vertical, horizontal]` in pixels. Defaults to [3, 6]. */
  padding?: [number, number]
  /** Corner radius in pixels. Defaults to 4. */
  cornerRadius?: number
  /** Optional stroke around the pill. */
  borderColor?: string
  borderOpacity?: number
  borderWidth?: number
}

/**
 * Auto-label config for a region layer. When `show` is true the renderer adds
 * a Mapbox symbol layer at each region's centroid (collision-detected) so
 * place names sit on top of the choropleth without the author placing each
 * label manually.
 */
export interface MapRegionLabels {
  show?: boolean
  /** Append each region's `value` after its name (e.g. "Bihar 8"). */
  withValue?: boolean
  /** Number of decimals when rendering the value. Defaults to 0. */
  valueDecimals?: number
  /** Prefix / suffix wrapped around the value (e.g. "$" / "%"). */
  valuePrefix?: string
  valueSuffix?: string
  /** When true, the value renders on its own line below the name. */
  valueOnNewLine?: boolean
  /** Override text color (theme token "$muted" or hex). Defaults to label palette. */
  color?: string
  /** Text size in pixels. Defaults to 11. */
  size?: number
  /**
   * Optional allowlist of region codes — when set, only these get a label.
   * Use to curate which states/countries are named on small cards.
   */
  codes?: string[]
  /** Draw a pill background behind each label. Omitted = text-only with halo. */
  background?: MapLabelBackground
}

/** Map legend overlay rendered above the map by share cards. */
export interface MapLegendConfig {
  show?: boolean
  /** Caption rendered above the swatch row (e.g. "Median household income"). */
  title?: string
  /** Short labels for the ramp endpoints (e.g. "Low → High"). */
  lowLabel?: string
  highLabel?: string
  /** Number of tick labels under a continuous ramp. Defaults to colors.length. */
  ticks?: number
  /** Decimals used when formatting numeric ticks. Defaults to 0. */
  valueDecimals?: number
  valuePrefix?: string
  valueSuffix?: string
  /**
   * Placement within the card. The four corner values render a compact pill
   * legend. `top` / `bottom` render a full-width strip across the card.
   * Defaults to 'top-left'.
   */
  position?:
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right'
    | 'top'
    | 'bottom'
}

export interface MapRegionLayer {
  /**
   * `country` uses Mapbox's built-in country-boundaries-v1 tileset.
   * `custom` requires `geojsonUrl` and `idProperty`.
   */
  level: MapRegionLevel
  /** For level: custom — URL or absolute path served by /public. */
  geojsonUrl?: string
  /** For level: custom — feature property whose value matches items[].code. */
  idProperty?: string
  items: MapRegion[]
  /**
   * Color stops for the value→color ramp. Two or more hex strings (or theme
   * tokens like "$accent"). Items with `value` but no explicit `color` get
   * interpolated between adjacent stops.
   */
  colors?: string[]
  /**
   * Domain values matching `colors` (same length). If omitted, the domain
   * is auto-computed from items[].value as [min, max] evenly-spaced across
   * the color stops.
   */
  ramp?: number[]
  /** Border color. Defaults to the last color in `colors` (or accent). */
  lineColor?: string
  /** Border width in pixels. Defaults to 0.6. */
  lineWidth?: number
  /** Auto-label each region with its name (and optional value). */
  labels?: MapRegionLabels
  /** Color-ramp legend rendered as a DOM overlay on share cards. */
  legend?: MapLegendConfig
}

/**
 * Free-floating text label rendered on the map at a fixed coordinate. Unlike
 * a pin label, no marker circle is drawn — just the text bubble. Use for
 * place names that aren't represented by a region (cities, POIs, contextual
 * callouts).
 */
export interface MapTextLabel {
  coordinates: [number, number]
  text: string
  /** Override text color (theme token or hex). Defaults to the label palette. */
  color?: string
  /** Anchor describes which side of the coordinate the text sits on. */
  anchor?: 'top' | 'bottom' | 'left' | 'right'
  /** Text size in pixels. Defaults to 11. */
  size?: number
}

export interface HeatmapPoint {
  coordinates: [number, number]
  /** Relative intensity (defaults to 1). */
  weight?: number
}

export interface HeatmapLayer {
  points: HeatmapPoint[]
  /** Radius in pixels at zoom 9. Defaults to 30. */
  radius?: number
  /** Explicit max weight for normalization. Auto-computed otherwise. */
  maxIntensity?: number
  /**
   * Color stops applied across weight 0..1. Five hex strings recommended;
   * first is transparent/low, last is the hot point color.
   */
  ramp?: string[]
  /** Layer opacity (0..1). Defaults to 0.75. */
  opacity?: number
}

export interface MapStep {
  center: [number, number]
  zoom: number
  pitch?: number
  bearing?: number
  flySpeed?: number
  opacity?: number
  pins?: MapPin[]
  /** Optional choropleth layer for this step. */
  regions?: MapRegionLayer
  /** Optional heatmap layer for this step. */
  heatmap?: HeatmapLayer
  /** Free-floating text labels (no pin marker beneath). */
  textLabels?: MapTextLabel[]
}

export interface ScrollySectionBlock {
  type: 'scrolly-section'
  steps: ScrollStep[]
  chartId?: string
}

export interface ScenarioToggleBlock {
  type: 'scenario-toggle'
  scenarios: {
    label: string
    table: DataTableBlock
  }[]
}

export interface TakeawayItem {
  audience: string
  content: string
}

export interface TakeawayGridBlock {
  type: 'takeaway-grid'
  items: TakeawayItem[]
}

export interface MethodologyBlock {
  type: 'methodology'
  content: string[]
}

export interface FooterBlock {
  type: 'footer'
  text: string
}

export interface UnknownBlock {
  type: 'unknown'
  content: string
}

export type Block =
  | HeroBlock
  | StatBlock
  | ActHeaderBlock
  | DividerBlock
  | ProseBlock
  | SubsectionHeaderBlock
  | DataTableBlock
  | ExposureGridBlock
  | ScrollySectionBlock
  | ScenarioToggleBlock
  | TakeawayGridBlock
  | MethodologyBlock
  | FooterBlock
  | UnknownBlock
