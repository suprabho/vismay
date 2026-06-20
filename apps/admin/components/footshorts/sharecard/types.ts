import type { FixtureRow, StandingRow, FixtureEvent, EventTypeFilter } from '@vismay/footshorts-viz/types'
import type { ThemeName, ColorTokens, Theme } from '@footshorts/brand'
import { themes } from '@footshorts/brand'

/** Output aspect ratios the creator supports (display label : intrinsic ratio). */
export type AspectRatio = '1:1' | '4:5' | '9:16' | '3:4' | '5:4' | '4:3'

export const ASPECT_RATIOS: Array<{ id: AspectRatio; label: string }> = [
  { id: '1:1', label: 'Square 1:1' },
  { id: '4:5', label: 'Portrait 4:5' },
  { id: '9:16', label: 'Story 9:16' },
  { id: '3:4', label: 'Tall 3:4' },
  { id: '5:4', label: 'Wide 5:4' },
  { id: '4:3', label: 'Landscape 4:3' },
]

/** Exported pixel dimensions per ratio. Display renders at OUTPUT × RENDER_SCALE,
 *  captured back to OUTPUT via pixelRatio (= 1 / RENDER_SCALE). */
export const OUTPUT_SIZE: Record<AspectRatio, { w: number; h: number }> = {
  '1:1': { w: 1080, h: 1080 },
  '4:5': { w: 1080, h: 1350 },
  '9:16': { w: 1080, h: 1920 },
  '3:4': { w: 1080, h: 1440 },
  '5:4': { w: 1350, h: 1080 },
  '4:3': { w: 1440, h: 1080 },
}

/** Shrink factor from output px → on-screen render px. Lower = the fixed-px card
 *  content (text, crests, the viz components) occupies a larger share of the
 *  card and is scaled up more on export, i.e. bigger type. */
export const RENDER_SCALE = 0.3

export type CardType =
  | 'match'
  | 'match-timeline'
  | 'fixtures'
  | 'standings'
  | 'form'
  | 'news-image'
  | 'news-article'
  | 'ai-image'

export const CARD_TYPES: Array<{ id: CardType; label: string }> = [
  { id: 'match', label: 'Match' },
  { id: 'match-timeline', label: 'Match timeline' },
  { id: 'fixtures', label: 'Fixtures' },
  { id: 'standings', label: 'Standings' },
  { id: 'form', label: 'Form grid' },
  { id: 'news-image', label: 'News image' },
  { id: 'news-article', label: 'News article' },
  { id: 'ai-image', label: 'AI image' },
]

export interface NewsEntityRef {
  id: string
  type: 'team' | 'league'
  slug: string
  name: string
  crest_url: string | null
  primary_color: string | null
}

export interface NewsItem {
  id: string
  headline: string
  summary: string | null
  image_url: string | null
  publisher: string | null
  url: string | null
  published_at: string
  entities: NewsEntityRef[]
}

/** Match rendering style: the colorful `fs:match-tile`, or one of the editorial
 *  `fs:match-card` layouts. */
export type MatchStyle = 'tile' | 'card-horizontal' | 'card-portrait' | 'card-score'

export const MATCH_STYLES: Array<{ id: MatchStyle; label: string }> = [
  { id: 'tile', label: 'Tile' },
  { id: 'card-horizontal', label: 'Card · Horizontal' },
  { id: 'card-portrait', label: 'Card · Portrait' },
  { id: 'card-score', label: 'Card · Score' },
]

/** Row density for the multi-fixture `fs:match-row` list — maps to MatchRow's
 *  `variant`. Compact fits more matches; expanded is a chunkier scoreboard row. */
export type MatchRowVariant = 'compact' | 'expanded'

export const MATCH_ROW_VARIANTS: Array<{ id: MatchRowVariant; label: string }> = [
  { id: 'compact', label: 'Compact' },
  { id: 'expanded', label: 'Expanded' },
]

/** What the canvas renders — a discriminated union by card type. */
export type CardContent =
  | { type: 'match'; fixture: FixtureRow; competitionName: string; style: MatchStyle }
  | {
      type: 'match-timeline'
      /** The fixture the events belong to — rendered as a match-type card above
       *  the timeline so the card always names the match it recaps. */
      fixture: FixtureRow
      /** Which match-type card heads the timeline (any style except the row
       *  "line" used by the fixtures list). */
      style: MatchStyle
      events: FixtureEvent[]
      competitionName: string
      filter: EventTypeFilter
    }
  | {
      type: 'fixtures'
      fixtures: FixtureRow[]
      competitionName: string
      variant: MatchRowVariant
    }
  | {
      type: 'standings'
      rows: StandingRow[]
      competitionName: string
      season: string
      /** Set for group-stage competitions (e.g. "Group A"); null for league tables. */
      groupLabel?: string | null
      highlightSlug?: string | null
    }
  | { type: 'form'; fixtures: FixtureRow[]; teamSlug: string; teamName: string }
  | { type: 'news-image'; item: NewsItem }
  | { type: 'news-article'; item: NewsItem }
  | { type: 'ai-image'; dataUrl: string; caption: string }

/** A decorative backdrop painted behind a data card's content (match,
 *  standings, fixtures, form, timeline, news-article). Bleed cards
 *  (news-image / ai-image) ignore it — their image already IS the card.
 *  `aura` embeds the animated `aura.promad.design` iframe: it shows in the
 *  live preview but, like every aura in this repo, is NOT rasterized into the
 *  exported PNG (html-to-image can't capture cross-origin iframes). News and
 *  AI image backgrounds capture cleanly. */
export type CardBackground =
  | { type: 'none' }
  | { type: 'news'; url: string; label?: string }
  | { type: 'ai'; dataUrl: string }
  | { type: 'aura'; slug: string }
  /** A generic image backdrop sourced from the Background tab's picker — a news
   *  thumbnail / upload / AI generation. `src` is a base64 data URL (upload or
   *  generated, captured directly) or a remote URL (a news image, proxied on
   *  render). Supersedes the narrower `news` / `ai` variants for new cards;
   *  those are retained so older snapshots still render. */
  | { type: 'image'; src: string }

export const BACKGROUND_KINDS: Array<{ id: Exclude<CardBackground['type'], 'none'>; label: string }> = [
  { id: 'image', label: 'Image' },
  { id: 'aura', label: 'Aura' },
]

/** Phosphor icon weights (subset we expose in the icon picker). */
export type PhosphorWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'

/** A foreground element placed on the card. Originally just team crests /
 *  competition logos / country flags, now also free images (upload / AI / news
 *  thumbnail), emoji, and Phosphor icons. Position is the element CENTER as a %
 *  of the card; `widthPct` is a % of the card width. The render-affecting extras
 *  (`scale` / `rotation` / `opacity` / `groupId`) are all OPTIONAL so cards saved
 *  before they existed round-trip unchanged (read with `?? default`). */
export type OverlayKind = 'crest' | 'logo' | 'flag' | 'image' | 'emoji' | 'icon'

export interface Overlay {
  id: string
  /** Image src for crest / logo / flag / image kinds (absent for emoji / icon). */
  url?: string
  label: string
  kind: OverlayKind
  /** Native glyph for `kind:'emoji'`. */
  glyph?: string
  /** Phosphor export name + weight + color for `kind:'icon'`. */
  iconName?: string
  iconWeight?: PhosphorWeight
  iconColor?: string
  /** Provenance + fit for `kind:'image'`. */
  source?: 'upload' | 'generated' | 'news'
  objectFit?: 'contain' | 'cover'
  // ── placement ──
  xPct: number
  yPct: number
  widthPct: number
  /** Box-fit images only; absent = square sized by width. */
  heightPct?: number
  /** CSS multiplier applied on top of the width sizing (default 1). */
  scale?: number
  /** Degrees clockwise, matching CSS rotate() (default 0). */
  rotation?: number
  /** 0–1 (default 1). */
  opacity?: number
  /** false = hidden (default true). */
  visible?: boolean
  /** Membership in an `OverlayGroup` — kept contiguous in the array. */
  groupId?: string
}

/** Editor-only foreground group. Membership lives on each overlay's `groupId`;
 *  the renderer ignores groups (group transforms rewrite each member's own flat
 *  transform). Optional / additive: cards saved before grouping have none. */
export interface OverlayGroup {
  id: string
  name: string
  /** Panel-only: members hidden under a collapsed header. */
  collapsed?: boolean
}

/** Per-card theme override: a base preset plus sparse color / font patches. Kept
 *  sparse (not a full Theme) so the snapshot stays small and survives base-theme
 *  edits. Resolve to a full `Theme` via `resolveTheme` before `themeToVars`. */
export interface CardThemeOverride {
  base: ThemeName
  colors?: Partial<ColorTokens>
  fonts?: Partial<{ sans: string; display: string; mono: string }>
}

/** Merge a sparse per-card override onto its base preset → a full `Theme`.
 *  `themeToVars` requires a complete Theme, so this always returns one. With no
 *  override it's just the named preset. */
export function resolveTheme(
  override: CardThemeOverride | undefined,
  themeName: ThemeName,
): Theme {
  const base = themes[override?.base ?? themeName]
  if (!override) return base
  return {
    ...base,
    colors: { ...base.colors, ...(override.colors ?? {}) },
    typography: {
      ...base.typography,
      fontFamily: { ...base.typography.fontFamily, ...(override.fonts ?? {}) },
    },
  }
}

export type LogoSize = 'sm' | 'md' | 'lg'
/** Brand-mark color treatments: filled accent badge, white (for photos), dark
 *  (for light cards), or just the accent-colored ball with no badge. */
export type LogoVariant = 'accent' | 'light' | 'dark' | 'mark'

export const LOGO_SIZES: Array<{ id: LogoSize; label: string }> = [
  { id: 'sm', label: 'Small' },
  { id: 'md', label: 'Medium' },
  { id: 'lg', label: 'Large' },
]
export const LOGO_VARIANTS: Array<{ id: LogoVariant; label: string }> = [
  { id: 'accent', label: 'Accent' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'mark', label: 'Mark only' },
]

/** Frame-level styling shared by every card. */
export interface CardFrameConfig {
  themeName: ThemeName
  /** Per-card theme override (presets + per-token colors + fonts). When set it
   *  supersedes `accentHex` (its `colors.accent` flows through `themeToVars`). */
  themeOverride?: CardThemeOverride
  ratio: AspectRatio
  /** Optional club accent hex; overrides the theme accent on this card. Legacy:
   *  superseded by `themeOverride.colors.accent` once a theme override exists. */
  accentHex?: string | null
  /** Small eyebrow label in the header (e.g. competition name). */
  eyebrow?: string | null
  /** Handle shown in the footer. */
  handle: string
  /** Brand-mark size + color treatment. */
  logoSize: LogoSize
  logoVariant: LogoVariant
  /** Bleed-card caption: text color + bottom-gradient strength (0–1). */
  captionColor: string
  gradientStrength: number
  /** Decorative backdrop behind data-card content. Ignored by bleed cards. */
  background?: CardBackground
  /** Dark scrim over the background for content legibility (0–1). */
  backgroundScrim?: number
}
