import type { FixtureRow, StandingRow, FixtureEvent, EventTypeFilter } from '@vismay/footshorts-viz/types'
import type { ThemeName } from '@footshorts/brand'

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

export const BACKGROUND_KINDS: Array<{ id: Exclude<CardBackground['type'], 'none'>; label: string }> = [
  { id: 'news', label: 'News image' },
  { id: 'ai', label: 'AI image' },
  { id: 'aura', label: 'Aura' },
]

/** A draggable badge placed on the card — a team crest, competition logo, or
 *  country flag. Position is the badge CENTER as a % of the card; width is a %
 *  of the card width. */
export interface Overlay {
  id: string
  url: string
  label: string
  /** badge kind, for the picker only */
  kind: 'crest' | 'logo' | 'flag'
  xPct: number
  yPct: number
  widthPct: number
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
  ratio: AspectRatio
  /** Optional club accent hex; overrides the theme accent on this card. */
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
