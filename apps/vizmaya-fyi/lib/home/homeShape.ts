import type { StoryCardData } from '@vismay/ui'

/**
 * The home page's data model and the pieces both of its renderers share: the
 * React page (components/home/HomeStory.tsx) and the stage documents it frames
 * (lib/home/renderHomeStage.ts, served at /home-stage/<format>). Pure, so the
 * client can import it.
 */

/** A story as the home page lists it (the shared story-card shape). */
export type HomeStory = StoryCardData

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
  dailyEditions: HomeDailyEdition[]
  /** The Doom v Boom palette as CSS variables (--boom, --surface, …). */
  dailyVars: Record<string, string>
  /** Google Fonts links for the stories' own typefaces. */
  fontUrls: string[]
}

/** The studio's voice, shared by the page and every stage. */
export const STUDIO = {
  name: 'Vizmaya Labs',
  statement: 'We turn complex data into stories impossible to ignore.',
  deck: 'A two-person data-journalism studio. The map does the argument, the prose does the meaning — and we refuse to let the distance between what is true and what is understood be someone else’s problem.',
  motto: 'Sits at the border between what is true and what is understood.',
  email: 'vizmaya@promad.design',
  newsletter: 'https://theasymmetryletter.substack.com',
  youtube: 'https://www.youtube.com/@Vizmayaa',
  linkedin: 'https://www.linkedin.com/company/vizmaya/',
  x: 'https://x.com/VizmayaFyi',
}

/**
 * The home page's palette, a night edition: warm paper-white type on
 * blue-black, one signal colour (vermilion) and one cool secondary (sky).
 * The page (components/home/HomeStory.tsx) and every stage read it, so the
 * look changes here. The Penrose logo keeps its own teal, pink and blue.
 */
export const PALETTE = {
  bg: '#0E0F12',
  surface: '#16181C',
  surface2: '#1D2025',
  text: '#EEE8DD',
  muted: '#A39E94',
  dim: '#6E6A63',
  line: 'rgba(238,232,221,.10)',
  line2: 'rgba(238,232,221,.20)',
  signal: '#FF6A3D',
  sky: '#8EB9FF',
  mint: '#7ED9B4',
  /** The book's pages, and the ink printed on them. */
  paper: '#F2EDE3',
  paperInk: '#17181C',
  paperMuted: '#6B665E',
}

/** The Penrose mark's own colours (the logo, not the page). */
export const MARK = { teal: '#0BBFAB', pink: '#E84D7A', blue: '#2B4ACF' }

/**
 * The type: Instrument Serif for headlines and big numbers (one weight, with
 * a true italic), Instrument Sans for text, Geist Mono for dates and data.
 */
export const TYPE = {
  serif: 'Instrument Serif',
  sans: 'Instrument Sans',
  mono: 'Geist Mono',
}

// ── views ─────────────────────────────────────────────────────────────────

/** The formats the front page can be bound in; each is a stage document. */
export type HomeStageFormat = 'book' | 'board' | 'deck'
/** What the reader picks: a bound format, or the plain scrolling list. */
export type HomeView = HomeStageFormat | 'scroll'

export const HOME_STAGE_FORMATS: readonly HomeStageFormat[] = ['book', 'board', 'deck']
export const HOME_VIEWS: readonly HomeView[] = ['book', 'board', 'deck', 'scroll']

export const HOME_VIEW_META: Record<HomeView, { label: string; hint: string }> = {
  book: { label: 'Book', hint: 'Turn the pages: tap, drag, or the arrow keys.' },
  board: { label: 'Board', hint: 'Follow the tour, or drag and pinch around the board.' },
  deck: { label: 'Deck', hint: 'Step through the slides, or deal them as cards.' },
  scroll: { label: 'Scroll', hint: 'Every story as one long page.' },
}

export function isHomeView(v: unknown): v is HomeView {
  return typeof v === 'string' && (HOME_VIEWS as readonly string[]).includes(v)
}

export function isHomeStageFormat(v: unknown): v is HomeStageFormat {
  return typeof v === 'string' && (HOME_STAGE_FORMATS as readonly string[]).includes(v)
}

/** Where a stage document is served. */
export function homeStageUrl(format: HomeStageFormat, topic: string | null): string {
  return `/home-stage/${format}${topic ? `?topic=${encodeURIComponent(topic)}` : ''}`
}

/**
 * The message a stage document posts to the page around it: `ready` once its
 * runtime has taken the page over, `linear` when the reader asks the runtime
 * for its one-page view (the page answers by switching to Scroll).
 */
export const HOME_STAGE_MESSAGE = 'vizmaya:home-stage'
export type HomeStageEvent = 'ready' | 'linear'

/** How many stories the front page binds; the rest are in the archive. */
export const FRONT_PAGE_LIMIT = 12

// ── stories ───────────────────────────────────────────────────────────────

export function storyHref(s: HomeStory): string {
  return s.href ?? `/story/${s.slug}`
}

/** The distinct topics the stories carry, in first-seen order. */
export function storyTopics(stories: HomeStory[]): string[] {
  return Array.from(new Set(stories.map((s) => s.topic).filter((t): t is string => Boolean(t))))
}

export function storiesForTopic(stories: HomeStory[], topic: string | null): HomeStory[] {
  return topic ? stories.filter((s) => s.topic === topic) : stories
}

export interface StoryPalette {
  bg: string
  text: string
  muted: string
  accent: string
}

const FALLBACK_ACCENTS = [PALETTE.signal, PALETTE.sky, PALETTE.mint]
const HEX = /^#[0-9a-f]{3,8}$/i

/** A story's own colours (its theme), or an ink card in the brand tricolour. */
export function storyPalette(s: HomeStory, index: number): StoryPalette {
  const c = s.theme?.colors
  const ok = (v: string | undefined) => (v && HEX.test(v) ? v : undefined)
  return {
    bg: ok(c?.background) ?? PALETTE.surface2,
    text: ok(c?.text) ?? PALETTE.text,
    muted: ok(c?.muted) ?? PALETTE.muted,
    accent: ok(c?.accent) ?? FALLBACK_ACCENTS[index % FALLBACK_ACCENTS.length],
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

/** What a story's meta line says: its date, topic and format. */
export function storyMetaBits(s: HomeStory): string[] {
  return [formatStoryDate(s.date), s.topic, s.format].filter((x): x is string => Boolean(x))
}

/** A story's number on the front page: '01', '02', … */
export function storyNumber(index: number): string {
  return String(index + 1).padStart(2, '0')
}
