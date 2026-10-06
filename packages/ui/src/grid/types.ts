import type { Theme } from '@vismay/viz-engine'

export type { Theme }

/**
 * The fields a bento story card renders. Mirrors the home-page `HomeStory`
 * shape so the marketing site and the admin preview render from one model.
 */
export interface StoryCardData {
  slug: string
  title: string
  subtitle: string
  date: string
  byline?: string
  aura?: string
  theme?: Theme
  /** Optional editorial topic — drives the card pill. */
  topic?: string
  /**
   * Optional story-format label for an HTML story that isn't a scrolling page
   * ("Book", "Board", "Deck"): a second pill beside the topic.
   */
  format?: string
  /** Optional cover image URL shown as the card thumbnail background. */
  thumbnail?: string
  /** Optional text colour when a thumbnail is shown — keeps title/READ legible. */
  thumbnailTextColor?: string
  /**
   * Where the card links when it isn't `${hrefBase}${slug}` — e.g. an HTML
   * story at /s/<slug>. Rendered as a plain <a> (a full page load), since the
   * target isn't a route the link component can navigate to client-side.
   */
  href?: string
}

/** A card plus the 0-based number shown as its badge (padded to two digits). */
export interface StoryGridItem {
  data: StoryCardData
  n: number
}
