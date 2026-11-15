import type { StoryCategoryId } from '@vismay/html-stories/categories'
import { storyCategoryLabel } from '@vismay/html-stories/categories'
import type { StoryCardData } from '@vismay/ui'
import { LOGO, logoScheme, type Scheme } from './logoPalette'

/**
 * The home page's data model and helpers (components/home/HomeWall.tsx).
 * Pure, so the client can import it.
 */

/** A story as the home page lists it (the shared story-card shape). */
export type HomeStory = StoryCardData & {
  /** The subject area the story is filed under (@vismay/html-stories/categories). */
  category?: StoryCategoryId
}

/** One category's section under the wall (./sections): its newest stories not already on the wall. */
export interface HomeSection {
  category: StoryCategoryId
  stories: HomeStory[]
}

export interface HomeEpic {
  slug: string
  name: string
  description: string | null
  /** Per-epic theme override (loose jsonb; may be `{}`). */
  theme?: Record<string, unknown>
}

/** One Doom v Boom edition as the home page shows it (shaped on the server). */
export interface HomeDailyEdition {
  href: string
  /** 'Thu 24 Sep' */
  date: string
  number: number | null
  headline: string
  /** The raw −1…+1 reading, for the ring. */
  moodScore: number | null
  /** Boom Score 0–100; null when the window had no scored story. */
  score: number | null
  /** The signed −1…+1 reading, e.g. '+0.42'. */
  signed: string
  /** 'Boom-leaning', 'Balanced', … */
  word: string
  tone: 'boom' | 'doom' | 'mid'
}

export interface HomeData {
  stories: HomeStory[]
  epics: HomeEpic[]
  /** The categories with enough stories to show, in page order. */
  sections: HomeSection[]
  dailyEditions: HomeDailyEdition[]
  /** The Doom v Boom palette as CSS variables (--boom, --surface, …). */
  dailyVars: Record<string, string>
  /** Google Fonts links for the stories' own typefaces. */
  fontUrls: string[]
}

/**
 * The home page's colours, generated from the logo (./logoPalette): the
 * Penrose mark's pink leads, on a ground tinted by its blue. The page reads
 * only these, so the look changes here.
 */
export const HOME_SCHEME: Scheme = logoScheme('Penrose', 'pink', 'blue')

/** The Penrose mark's own colours, exactly as drawn. */
export const MARK = LOGO

/** How many stories the wall shows; the rest are in the archive. */
export const FRONT_PAGE_LIMIT = 12

// ── stories ───────────────────────────────────────────────────────────────

export function storyHref(s: HomeStory): string {
  return s.href ?? `/story/${s.slug}`
}

export interface StoryPalette {
  bg: string
  text: string
  muted: string
  accent: string
}

/** The scheme's three logo colours, in its order: lead, second, third. */
export const SCHEME_ACCENTS = ['var(--signal)', 'var(--second)', 'var(--third)']
const HEX = /^#[0-9a-f]{3,8}$/i

/**
 * A story's own colours (its theme), or, where it has none, the page's
 * surface and the logo colours in turn.
 */
export function storyPalette(s: HomeStory, index: number): StoryPalette {
  const c = s.theme?.colors
  const ok = (v: string | undefined) => (v && HEX.test(v) ? v : undefined)
  return {
    bg: ok(c?.background) ?? 'var(--surface2)',
    text: ok(c?.text) ?? 'var(--text)',
    muted: ok(c?.muted) ?? 'var(--muted)',
    accent: ok(c?.accent) ?? SCHEME_ACCENTS[index % SCHEME_ACCENTS.length],
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * '6 Oct 2026'. Read in UTC and spelled out by hand, so the server and the
 * browser print the same thing whatever their locale and time zone.
 */
export function formatStoryDate(date: string | undefined | null): string {
  if (!date) return ''
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return date
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/**
 * What a story's meta line says: its date, topic and format, and, on the
 * wall, its category (a section already says which one it is).
 */
export function storyMetaBits(s: HomeStory, { category = false }: { category?: boolean } = {}): string[] {
  return [formatStoryDate(s.date), category ? storyCategoryLabel(s.category) : undefined, s.topic, s.format].filter((x): x is string =>
    Boolean(x)
  )
}

/**
 * A story as a tile shows it: the story itself, chrome-less (`?embed=1` drops
 * the site header and keeps the visit out of analytics). An HTML story is
 * also asked for its preview, which leaves out its format's controls (a
 * board's tour panel, minimap and buttons) and the Listen player.
 */
export function storyPreviewUrl(s: HomeStory): string {
  return `${storyHref(s)}?embed=1${s.href ? '&preview=1' : ''}`
}

/** An epic's landing page, and the same page as its band previews it. */
export function epicHref(e: HomeEpic): string {
  return `/${e.slug}`
}
export function epicPreviewUrl(e: HomeEpic): string {
  return `${epicHref(e)}?embed=1`
}
