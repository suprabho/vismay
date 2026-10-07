/**
 * Story formats for agent-authored HTML stories. `scroll` is the classic
 * long page; `book`, `board` and `deck` are paged formats whose mechanics
 * (page turns, the board's camera, slides and cards, the one-column view)
 * come from versioned runtimes each site hosts at /formats/<name>@<major>.js
 * and .css (sources in ../formats, served by ./formatsApi). The agent writes
 * the content markup, its design and its charts; a page declares its format
 * with <meta name="vizmaya:format" content="book">, which ./htmlStories keeps
 * in html_stories.format (migration 089) for the listing badges.
 *
 * Pure — no Supabase / Node imports — so the brief, the lint, client
 * components and the MCP server can all use it.
 */

import { HTML_STORY_APP_META, type HtmlStoryApp } from './apps'

export type HtmlStoryFormat = 'scroll' | 'book' | 'board' | 'deck'
/** The formats a hosted runtime drives. */
export type PagedHtmlStoryFormat = Exclude<HtmlStoryFormat, 'scroll'>

export const HTML_STORY_FORMATS: readonly HtmlStoryFormat[] = ['scroll', 'book', 'board', 'deck']
export const PAGED_HTML_STORY_FORMATS: readonly PagedHtmlStoryFormat[] = ['book', 'board', 'deck']
export const DEFAULT_HTML_STORY_FORMAT: HtmlStoryFormat = 'scroll'

export const FORMAT_META_NAME = 'vizmaya:format'

/**
 * The runtimes' major version, the `@1` in their URLs. A published page
 * keeps loading the same major: fixes ship under it without a re-post, and a
 * breaking change becomes @2 (served beside @1, which keeps working).
 */
export const FORMAT_RUNTIME_MAJOR = 1

export interface HtmlStoryFormatMeta {
  label: string
  /** What the reader does, in one line. */
  reader: string
  /** The kind of story it suits (the randomizer and admin picker show it). */
  suits: string
  /** What one unit of the story is called. */
  unit: string
}

export const HTML_STORY_FORMAT_META: Record<HtmlStoryFormat, HtmlStoryFormatMeta> = {
  scroll: {
    label: 'Scroll',
    reader: 'Scrolls one long page; charts and steps animate as they come into view.',
    suits: 'most stories, and anything built around a scrollytelling map',
    unit: 'section',
  },
  book: {
    label: 'Book',
    reader: 'Turns pages: tap, drag a page across, or the arrow keys. A two-page spread on wide screens.',
    suits: 'a chronology or a journey, told in order',
    unit: 'page',
  },
  board: {
    label: 'Board',
    reader: 'Follows a guided tour as the camera flies between pinned items, or pans and zooms freely.',
    suits: 'a case built from many connected pieces',
    unit: 'item',
  },
  deck: {
    label: 'Deck',
    reader: 'Steps through slides, or switches to a stack of cards and swipes them away.',
    suits: 'an argument made one point at a time',
    unit: 'slide',
  },
}

export function isHtmlStoryFormat(value: unknown): value is HtmlStoryFormat {
  return typeof value === 'string' && (HTML_STORY_FORMATS as readonly string[]).includes(value)
}

export function isPagedHtmlStoryFormat(value: unknown): value is PagedHtmlStoryFormat {
  return typeof value === 'string' && (PAGED_HTML_STORY_FORMATS as readonly string[]).includes(value)
}

/** The format a `format` query/body value names, or the default when absent. Null when it names an unknown format. */
export function parseHtmlStoryFormat(value: unknown): HtmlStoryFormat | null {
  if (value == null || value === '') return DEFAULT_HTML_STORY_FORMAT
  const v = typeof value === 'string' ? value.trim().toLowerCase() : value
  return isHtmlStoryFormat(v) ? v : null
}

/**
 * Where an app's runtimes live. Always the production origin, never the
 * deployment that served the brief: a published page loads them for as long
 * as it's up, so they must not point at a preview or a dev server.
 */
export function formatsBaseUrl(app: HtmlStoryApp): string {
  return `${HTML_STORY_APP_META[app].siteUrl}/formats`
}

export function formatRuntimeUrls(app: HtmlStoryApp, format: PagedHtmlStoryFormat): { css: string; js: string } {
  const base = `${formatsBaseUrl(app)}/${format}@${FORMAT_RUNTIME_MAJOR}`
  return { css: `${base}.css`, js: `${base}.js` }
}

/** The reference page for a format: the Odyssey voyage told as a book, a board or a deck. */
export function formatExampleUrl(app: HtmlStoryApp, format: PagedHtmlStoryFormat): string {
  return `${formatsBaseUrl(app)}/examples/odyssey-${format}.html`
}

/**
 * Which format a randomizer spin's story tends to suit, for the brief's hint:
 * an epic is a journey told in order (a book), an Atlas spin a place built
 * from many pieces (a board), a Desk or Football Desk spin an argument (a deck).
 */
export function suggestedFormatFor(randomizer: 'desk' | 'atlas' | 'epics' | 'footshorts'): PagedHtmlStoryFormat {
  return randomizer === 'epics' ? 'book' : randomizer === 'atlas' ? 'board' : 'deck'
}
