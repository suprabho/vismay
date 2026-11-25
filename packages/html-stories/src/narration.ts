/**
 * Section-wise narration for HTML stories: which parts of a page are its
 * sections, and what the voice reads for each. ./audio.ts turns the sections
 * into one audio clip apiece once a story is published; ./audioPlayer.ts finds
 * the same sections in the browser and plays the clips.
 *
 * The sections are, in document order, the page's outermost
 *   1. `[data-unit]` elements (every paged format: pages, slides, board
 *      steps, collage scenes, recap chapters), else
 *   2. `[data-step]` elements (a scroll story's chapters), else
 *   3. `<section>` elements.
 * A section inside another section of the same kind is part of it. The
 * player resolves the same list with the same rule before any runtime moves
 * the DOM, so a clip's index is its section's position in that list.
 *
 * What the voice reads for a section, first match wins:
 *   1. its line in the story's narration script (written in admin's Section
 *      audio panel, html_story_scripts; see narrationRule's
 *      NarrationScriptEntry), read as written, even for a silent section;
 *   2. the author's `data-narration="…"`, read verbatim;
 *   3. nothing, when it is marked `data-no-narrate` (also on any element
 *      inside one, to leave just that out);
 *   4. its on-screen text: headings, paragraphs, list items and quotes.
 *      Figures, tables, charts, scripts, controls and anything `aria-hidden`
 *      are skipped, since they read badly aloud (a chart's numbers are in the
 *      prose anyway).
 *
 * Server only (cheerio, node:crypto), but no Supabase: tests run it as is.
 */

import { createHash } from 'node:crypto'
import { load, type CheerioAPI } from 'cheerio'
import { NARRATION_SECTION_SELECTORS, normalizeNarrationScript, type NarrationScriptEntry } from './narrationRule'

export {
  MAX_SCRIPT_CHARS,
  NARRATION_SECTION_SELECTORS,
  htmlHash,
  narrationScriptHash,
  normalizeNarrationScript,
  type NarrationScriptEntry,
} from './narrationRule'

/** Never read: embedded media, charts, code, controls, credits. */
const SKIP_SELECTOR = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'iframe',
  'video',
  'audio',
  'picture',
  'img',
  'figure',
  'table',
  'button',
  'nav',
  'form',
  'select',
  'input',
  'textarea',
  '[aria-hidden="true"]',
  '[hidden]',
  '[data-no-narrate]',
  '[data-chart]',
].join(',')

/** A parsed node (domhandler's AnyNode, which cheerio doesn't re-export). */
type Element = Exclude<Parameters<typeof load>[0], string | Buffer | unknown[]>

/** The blocks whose text is read, each as its own sentence. */
const BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,dt,dd'

/** Shorter than this (in words) and a section isn't worth a clip. */
const MIN_WORDS = 3

export interface NarrationSection {
  /** Position in the page's section list (see the rule above). */
  index: number
  /** What the player shows: data-label, data-head, aria-label, the first heading, or "Section N". */
  label: string
  /** What the voice reads. Empty for a silent section. */
  text: string
  /** What it reads without a script: data-narration, else the on-screen text (empty when silent). */
  pageText: string
  /** Whether `text` comes from the narration script. */
  scripted: boolean
  /** sha256 of the text (and voice, see narrationHash): the clip's identity. */
  hash: string
}

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** End a block with punctuation so the voice pauses after a heading. */
function sentence(s: string): string {
  return /[.!?…:;,]["'”’)\]]?$/.test(s) ? s : `${s}.`
}

function outermost($: CheerioAPI, selector: string): Element[] {
  const all: Element[] = $(selector).toArray()
  const set = new Set<unknown>(all)
  return all.filter((el) => {
    for (let p = el.parent; p; p = p.parent) if (set.has(p)) return false
    return true
  })
}

/** The page's sections in order, by the first selector that matches. */
function sectionElements($: CheerioAPI): Element[] {
  for (const sel of NARRATION_SECTION_SELECTORS) {
    const els = outermost($, sel)
    if (els.length) return els
  }
  return []
}

function sectionText($: CheerioAPI, el: Element): string {
  const override = $(el).attr('data-narration')
  if (override != null) return clean(override)
  const copy = $(el).clone()
  copy.find(SKIP_SELECTOR).remove()
  // Leaf blocks only, so a <li><p>…</p></li> is read once.
  const blocks = copy
    .find(BLOCK_SELECTOR)
    .toArray()
    .filter((b) => $(b).find(BLOCK_SELECTOR).length === 0)
    .map((b) => clean($(b).text()))
    .filter(Boolean)
  if (blocks.length) return blocks.map(sentence).join(' ')
  return clean(copy.text())
}

function sectionLabel($: CheerioAPI, el: Element, index: number): string {
  const $el = $(el)
  const named = $el.attr('data-label') ?? $el.attr('data-head') ?? $el.attr('aria-label')
  if (named && clean(named)) return clean(named).slice(0, 80)
  const heading = clean($el.find('h1,h2,h3,h4').first().text())
  return heading ? heading.slice(0, 80) : `Section ${index + 1}`
}

/** Never part of a section's context: code and markup that isn't content. */
const CONTEXT_SKIP = 'script,style,noscript,template,svg,canvas,iframe,video,audio,button,select,input,textarea,[hidden]'

/**
 * Everything a section shows, for someone writing its narration (the admin's
 * Draft with AI): its text including figure captions, chart labels and table
 * cells, plus images' alt text as `[image: …]`, which the voice itself never
 * reads. Clipped to `max` characters per section, in the same section order.
 */
export function narrationSectionContext(html: string, max = 2000): string[] {
  const $ = load(html)
  return sectionElements($).map((el) => {
    const copy = $(el).clone()
    copy.find(CONTEXT_SKIP).remove()
    copy.find('img[alt]').each((_, img) => {
      const alt = clean($(img).attr('alt') ?? '')
      $(img).replaceWith(alt ? ` [image: ${alt}] ` : ' ')
    })
    // Keep block boundaries as spaces so words don't run together.
    copy.find('p,li,h1,h2,h3,h4,h5,h6,td,th,dt,dd,figcaption,blockquote,div,br').each((_, b) => {
      $(b).append(' ')
    })
    const text = clean(copy.text())
    return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
  })
}

export function narrationHash(text: string, voice: string): string {
  return createHash('sha256').update(`${voice}\n${text}`).digest('hex').slice(0, 32)
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length
}

/** A script line as spoken: paragraphs run on with a pause, whitespace collapsed. */
function scriptText(s: string): string {
  return s
    .split(/\n\s*\n/)
    .map(clean)
    .filter(Boolean)
    .map(sentence)
    .join(' ')
}

/**
 * The page's sections and what the voice reads for each (the order in the
 * header). A section with nothing to read, or under three words of page text
 * and no script line, keeps its index with empty text: it gets no clip, and the player skips it.
 */
export function extractNarrationSections(
  html: string,
  voice = '',
  script: NarrationScriptEntry[] = [],
): NarrationSection[] {
  const $ = load(html)
  const lines = new Map(normalizeNarrationScript(script).map((l) => [l.index, l.text]))
  return sectionElements($).map((el, index) => {
    const silent = $(el).is('[data-no-narrate]')
    let pageText = silent ? '' : sectionText($, el)
    if (wordCount(pageText) < MIN_WORDS) pageText = ''
    const line = lines.get(index)
    const scripted = line != null && wordCount(line) > 0
    // A script line is read however short: someone wrote it to be heard.
    const text = scripted ? scriptText(line) : pageText
    return { index, label: sectionLabel($, el, index), text, pageText, scripted, hash: text ? narrationHash(text, voice) : '' }
  })
}

/**
 * Split long text at sentence ends into pieces of at most `max` characters,
 * so one TTS request never runs past the provider's input limit. A single
 * sentence longer than `max` is cut at a space.
 */
export function splitForSpeech(text: string, max = 1800): string[] {
  if (text.length <= max) return [text]
  const sentences = text.match(/[^.!?…]+[.!?…]+["'”’)\]]*\s*|[^.!?…]+$/g) ?? [text]
  const out: string[] = []
  let cur = ''
  const push = () => {
    if (cur.trim()) out.push(cur.trim())
    cur = ''
  }
  for (let s of sentences) {
    while (s.length > max) {
      push()
      const cut = s.lastIndexOf(' ', max) > 0 ? s.lastIndexOf(' ', max) : max
      out.push(s.slice(0, cut).trim())
      s = s.slice(cut)
    }
    if (cur.length + s.length > max) push()
    cur += s
  }
  push()
  return out
}
