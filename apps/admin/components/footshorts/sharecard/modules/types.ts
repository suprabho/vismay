import type { EventTypeFilter } from '@vismay/footshorts-viz/types'
import type { MatchRowVariant, MatchStyle, PhosphorWeight } from '../types'

/**
 * `fscard:*` layer configs — each carries the PICKS (which competition, which
 * fixture, …), never resolved data. The module Component resolves picks against
 * the injected FootshortsDataProvider at render time, so a saved card re-resolves
 * live and bakes the resolved data only into the exported PNG.
 */

export interface FsCardMatchConfig {
  type: 'fscard:match'
  compKey: string
  fixtureId: string
  matchStyle: MatchStyle
}

export interface FsCardMatchTimelineConfig {
  type: 'fscard:match-timeline'
  compKey: string
  fixtureId: string
  eventFilter: EventTypeFilter
}

export interface FsCardFixturesConfig {
  type: 'fscard:fixtures'
  compKey: string
  fixtureIds: string[]
  variant: MatchRowVariant
}

export interface FsCardStandingsConfig {
  type: 'fscard:standings'
  compKey: string
  /** One group's table for group-stage cups; null/absent for league tables. */
  group?: string | null
}

export interface FsCardFormConfig {
  type: 'fscard:form'
  compKey: string
  teamSlug: string
}

export interface FsCardNewsImageConfig {
  type: 'fscard:news-image'
  newsId: string
}

export interface FsCardNewsArticleConfig {
  type: 'fscard:news-article'
  newsId: string
}

export interface FsCardAiImageConfig {
  type: 'fscard:ai-image'
  /** The generated image is embedded (data URL) — no fetch/resolution needed. */
  dataUrl: string
  caption?: string
}

export interface FsCardBadgeConfig {
  type: 'fscard:badge'
  url: string
  kind: 'crest' | 'logo' | 'flag'
  label?: string
  /** Badge CENTER as a % of the card; `widthPct` is its width as a % of card width. */
  xPct: number
  yPct: number
  widthPct: number
}

/** A native emoji glyph placed as a free overlay layer; sized to fill its
 *  transform box (so the composer's resize handles scale it). */
export interface FsCardEmojiConfig {
  type: 'fscard:emoji'
  glyph: string
}

/** A Phosphor icon overlay — name + weight + color; fills its transform box. */
export interface FsCardIconConfig {
  type: 'fscard:icon'
  iconName: string
  iconWeight: PhosphorWeight
  /** Hex (or `accent` / `text` / `currentColor`); blank falls back to the card text color. */
  iconColor: string
}

/** A free image overlay (upload / AI-generated / news thumbnail). `src` is a data
 *  URL (upload/generated) or a remote URL (news, proxied for capture). */
export interface FsCardImageConfig {
  type: 'fscard:image'
  src: string
  source?: 'upload' | 'generated' | 'news'
  objectFit: 'contain' | 'cover'
}

export type FsCardConfig =
  | FsCardMatchConfig
  | FsCardMatchTimelineConfig
  | FsCardFixturesConfig
  | FsCardStandingsConfig
  | FsCardFormConfig
  | FsCardNewsImageConfig
  | FsCardNewsArticleConfig
  | FsCardAiImageConfig
  | FsCardBadgeConfig
  | FsCardEmojiConfig
  | FsCardIconConfig
  | FsCardImageConfig
