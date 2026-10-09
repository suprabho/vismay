import type { StoryCardData } from '@vismay/ui'
import { LOGO, logoScheme, type Scheme } from './logoPalette'

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
 * The home page's colours, generated from the logo (./logoPalette): each
 * binding leads with one of the Penrose mark's dots on a ground tinted by it,
 * so switching formats shifts the whole page. Book teal, Board pink, Deck
 * blue; Scroll, the Penrose, keeps the pink lead on the blue's ground. The
 * page (components/home/HomeStory.tsx) and every stage read these, so the
 * look changes here.
 */
export const HOME_SCHEMES: Record<HomeView, Scheme> = {
  book: logoScheme('Teal', 'teal'),
  board: logoScheme('Pink', 'pink'),
  deck: logoScheme('Blue', 'blue'),
  scroll: logoScheme('Penrose', 'pink', 'blue'),
}

/** The Penrose mark's own colours, exactly as drawn. */
export const MARK = LOGO

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
  book: { label: 'Book', hint: 'The whole page as a book: tap, drag, or the arrow keys.' },
  board: { label: 'Board', hint: 'The whole page pinned to a board: follow the tour, or drag and pinch.' },
  deck: { label: 'Deck', hint: 'The whole page as slides, or a stack of cards to deal.' },
  scroll: { label: 'Scroll', hint: 'The whole page as one long scroll.' },
}

export function isHomeView(v: unknown): v is HomeView {
  return typeof v === 'string' && (HOME_VIEWS as readonly string[]).includes(v)
}

export function isHomeStageFormat(v: unknown): v is HomeStageFormat {
  return typeof v === 'string' && (HOME_STAGE_FORMATS as readonly string[]).includes(v)
}

/** Where a stage document is served. */
export function homeStageUrl(format: HomeStageFormat): string {
  return `/home-stage/${format}`
}

/** Where the reader's pick is remembered. */
export const HOME_VIEW_STORAGE_KEY = 'vizmaya:home-view'

/** The default binding: a book on wide screens, a deck on phones, where the board is weakest. */
export const HOME_WIDE_QUERY = '(min-width: 720px)'

/** The id of the style the boot script adds, and the classes it hides or fills in. */
export const HOME_PENDING_STYLE_ID = 'home-view-pending'

/**
 * Runs before the page paints (app/page.tsx inlines it): when the reader's
 * binding is a book, board or deck, it adds a <style> to <head> that hides
 * the server-rendered scroll page (.hs-scroll) and fills in the masthead
 * (.hs-mast) until the stage takes over, so the scroll page doesn't flash
 * first. HomeStory removes it once that binding is rendered (its
 * data-view says which). A style in <head>, not an attribute on <html>, so
 * hydration has nothing to disagree with. The bar wears that binding's
 * ground. Same precedence as components/home/homeViewStore. Without JS it
 * never runs and the scroll page shows.
 */
const BOOT_MAST = Object.fromEntries(HOME_STAGE_FORMATS.map((f) => [f, [HOME_SCHEMES[f].bg, HOME_SCHEMES[f].line]]))
export const HOME_VIEW_BOOT_SCRIPT = `(function(){try{var ok=/^(book|board|deck|scroll)$/,v=new URLSearchParams(location.search).get('view');if(!ok.test(v||'')){v=null;try{v=localStorage.getItem('${HOME_VIEW_STORAGE_KEY}')}catch(e){}if(!ok.test(v||''))v=matchMedia('${HOME_WIDE_QUERY}').matches?'book':'deck'}if(v==='scroll')return;var m=${JSON.stringify(BOOT_MAST)}[v],s=document.createElement('style');s.id='${HOME_PENDING_STYLE_ID}';s.setAttribute('data-view',v);s.textContent='.hs-scroll{display:none!important}.hs-mast{background:'+m[0]+'!important;border-color:'+m[1]+'!important}';document.head.appendChild(s);setTimeout(function(){s.remove()},5000)}catch(e){}})()`

/**
 * The message a stage document posts to the page around it: `ready` once its
 * runtime has taken the page over, `linear` when the reader asks the runtime
 * for its one-page view (the page answers by switching to Scroll).
 */
export const HOME_STAGE_MESSAGE = 'vizmaya:home-stage'
export type HomeStageEvent = 'ready' | 'linear'

/** How many stories the page binds; the rest are in the archive. */
export const FRONT_PAGE_LIMIT = 12

/** How the studio works, in three steps (the page and every stage). */
export const PROCESS = [
  { n: '01', title: 'A data brief', body: 'You bring findings worth publishing. We read the data the way a sceptical reader would.' },
  { n: '02', title: 'An editorial call', body: 'We agree the argument, the evidence and the one chart that carries it.' },
  { n: '03', title: 'Two to four weeks', body: 'Maps, charts and prose, built to travel: a scrolling story, a book, a board or a deck.' },
]

export const CONTACT = {
  title: 'Have data that deserves a better story?',
  body: 'We work with B2B data companies, research institutions and think tanks who have findings worth publishing but need the storytelling and design layer to make them travel. A typical engagement starts with a data brief and an editorial call. Turnaround is two to four weeks.',
}

/** The numbers the lede shows; zeros (no epics, no editions yet) are left out. */
export function homeStats(data: Pick<HomeData, 'stories' | 'epics' | 'dailyEditions'>): { n: number; label: string }[] {
  const latest = data.dailyEditions[0]
  return [
    { n: data.stories.length, label: 'stories published' },
    { n: data.epics.length, label: 'running epics' },
    { n: latest?.number ?? 0, label: 'mornings scored' },
    { n: 2, label: 'people' },
  ].filter((s) => s.n > 0)
}

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

/** The scheme's three logo colours, in its order: lead, second, third. */
export const SCHEME_ACCENTS = ['var(--signal)', 'var(--second)', 'var(--third)']
const HEX = /^#[0-9a-f]{3,8}$/i

/**
 * A story's own colours (its theme), or, where it has none, the binding's
 * surface and the logo colours in turn. The fallbacks are custom properties,
 * so they follow whichever scheme the story is shown in.
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

/** What a story's meta line says: its date, topic and format. */
export function storyMetaBits(s: HomeStory): string[] {
  return [formatStoryDate(s.date), s.topic, s.format].filter((x): x is string => Boolean(x))
}

/** A story's number on the front page: '01', '02', … */
export function storyNumber(index: number): string {
  return String(index + 1).padStart(2, '0')
}
