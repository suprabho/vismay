/**
 * Story formats for agent-authored HTML stories. `scroll` is the classic
 * long page; `book`, `board`, `deck`, `collage` and `recap` are
 * formats whose mechanics (page turns, the board's camera, slides and cards,
 * the collage's torn paper and stop-motion choreography, the race replay
 * beside the chapters, the one-column view) come from versioned runtimes each site
 * hosts at /formats/<name>@<major>.js and .css (sources in ../formats, served
 * by ./formatsApi). `recap` is vizf1's: it frames the site's 3D race replay. The agent writes
 * the content markup, its design and its charts; a page declares its format
 * with <meta name="vizmaya:format" content="book">, which ./htmlStories keeps
 * in html_stories.format (migration 089) for the listing badges.
 *
 * `diorama` is retired: no brief, picker or tool offers it any more, but it
 * stays a format so stories already published as dioramas keep their badge,
 * and its runtime (diorama@1) is still served so they keep rendering.
 *
 * Pure — no Supabase / Node imports — so the brief, the lint, client
 * components and the MCP server can all use it.
 */

import type { RandomizerId } from '@vismay/randomizer/types'
import { HTML_STORY_APP_META, type HtmlStoryApp } from './apps'

export type HtmlStoryFormat = 'scroll' | 'book' | 'board' | 'deck' | 'diorama' | 'collage' | 'recap'
/** Formats no longer offered for new stories; published ones still render. */
export type RetiredHtmlStoryFormat = 'diorama'
/** The formats a new story can be written in. */
export type AuthorableHtmlStoryFormat = Exclude<HtmlStoryFormat, RetiredHtmlStoryFormat>
/**
 * The formats a hosted runtime drives and a brief can be written for. (The
 * name predates `collage` and `recap`, which scroll like a page but are
 * driven by a runtime all the same.)
 */
export type PagedHtmlStoryFormat = Exclude<AuthorableHtmlStoryFormat, 'scroll'>

export const HTML_STORY_FORMATS: readonly HtmlStoryFormat[] = ['scroll', 'book', 'board', 'deck', 'diorama', 'collage', 'recap']
export const RETIRED_HTML_STORY_FORMATS: readonly RetiredHtmlStoryFormat[] = ['diorama']
export const AUTHORABLE_HTML_STORY_FORMATS: readonly AuthorableHtmlStoryFormat[] = ['scroll', 'book', 'board', 'deck', 'collage', 'recap']
export const PAGED_HTML_STORY_FORMATS: readonly PagedHtmlStoryFormat[] = ['book', 'board', 'deck', 'collage', 'recap']

export function isRetiredHtmlStoryFormat(value: unknown): value is RetiredHtmlStoryFormat {
  return typeof value === 'string' && (RETIRED_HTML_STORY_FORMATS as readonly string[]).includes(value)
}

/**
 * Formats only some sites can host: `recap` needs vizf1's race replay. Every
 * other format works on every site.
 */
const FORMAT_APPS: Partial<Record<HtmlStoryFormat, readonly HtmlStoryApp[]>> = { recap: ['vizf1'] }

/** Can a new story on this site be written in this format? Never for a retired one. */
export function isFormatForApp(app: HtmlStoryApp, format: HtmlStoryFormat): format is AuthorableHtmlStoryFormat {
  if (isRetiredHtmlStoryFormat(format)) return false
  const apps = FORMAT_APPS[format]
  return !apps || apps.includes(app)
}

/** The formats a new story on this site can be written in, in picker order. */
export function formatsForApp(app: HtmlStoryApp): AuthorableHtmlStoryFormat[] {
  return AUTHORABLE_HTML_STORY_FORMATS.filter((f) => isFormatForApp(app, f))
}
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
  // Retired: kept for the badge on stories already published as dioramas.
  diorama: {
    label: 'Diorama',
    reader: 'Scrolls while the camera moves over a tilted 3D model of the place: terrain, routes and data props that rise off the map.',
    suits: 'a story with a place, a route or a spatial comparison at its heart',
    unit: 'beat',
  },
  collage: {
    label: 'Collage',
    reader: 'Scrolls a kraft board of torn-paper pieces that land, stretch and stamp down in stop-motion as they come into view.',
    suits: 'a set of places, objects or claims laid side by side, each with how firm it is',
    unit: 'scene',
  },
  recap: {
    label: 'Race recap',
    reader: 'Scrolls the story while the 3D race replay beside it jumps to each moment, camera and car.',
    suits: 'a race told through its moments',
    unit: 'chapter',
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

/** Each format's reference page under /formats/examples/. */
export const FORMAT_EXAMPLES: Record<PagedHtmlStoryFormat, string> = {
  book: 'odyssey-book.html',
  board: 'odyssey-board.html',
  deck: 'odyssey-deck.html',
  collage: 'odyssey-collage.html',
  recap: 'austria-2024-recap.html',
}

/**
 * The reference page for a format: the Odyssey voyage told as a book, a board,
 * a deck or a cut-out collage; the 2024 Austrian Grand Prix as a race recap.
 */
export function formatExampleUrl(app: HtmlStoryApp, format: PagedHtmlStoryFormat): string {
  return `${formatsBaseUrl(app)}/examples/${FORMAT_EXAMPLES[format]}`
}

/**
 * Which format a randomizer spin's story tends to suit, for the brief's hint:
 * an epic is a journey told in order (a book), an Atlas spin a place built
 * from many pieces (a board), a Desk, Football Desk, NBA Desk, OCW Desk, Landmark Desk or 100 Desk spin an argument (a deck).
 */
export function suggestedFormatFor(randomizer: RandomizerId): Exclude<PagedHtmlStoryFormat, 'recap'> {
  return randomizer === 'epics' ? 'book' : randomizer === 'atlas' ? 'board' : 'deck'
}
