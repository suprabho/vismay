/**
 * Pure helpers for agent-authored HTML stories: slug rules, metadata
 * extraction (title / description / og:image / palette / format straight from
 * the document), and a light lint that tells the posting agent what will
 * break once hosted.
 *
 * No Supabase / Node imports — safe for client components and the MCP server.
 */

import {
  FORMAT_META_NAME,
  HTML_STORY_FORMAT_META,
  PAGED_HTML_STORY_FORMATS,
  isHtmlStoryFormat,
  type HtmlStoryFormat,
} from './formats'

export const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const MAX_SLUG_LENGTH = 80

/** Vercel functions reject request bodies over 4.5 MB; keep a margin. */
export const MAX_HTML_BYTES = 4 * 1024 * 1024

/**
 * The CSP a story (and a format's reference page) is served under: scripts
 * run, but in an opaque origin with no access to the site's cookies or
 * storage. The brief tells authors to expect that.
 */
export const HTML_STORY_SANDBOX_CSP =
  'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms ' +
  'allow-modals allow-downloads allow-presentation'

export type HtmlStoryStatus = 'draft' | 'published' | 'archived'
export const HTML_STORY_STATUSES: HtmlStoryStatus[] = ['draft', 'published', 'archived']

export function isSafeSlug(slug: string): boolean {
  return slug.length <= MAX_SLUG_LENGTH && SAFE_SLUG.test(slug)
}

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '')
}

export interface HtmlMeta {
  title: string | null
  description: string | null
  ogImageUrl: string | null
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

function clean(s: string | undefined | null): string | null {
  if (!s) return null
  const out = decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
  return out || null
}

function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tag))) attrs[(m[1] ?? '').toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? ''
  return attrs
}

function metaTags(html: string): Record<string, string>[] {
  return (html.match(/<meta\b[^>]*>/gi) ?? []).map(parseAttrs)
}

function metaContent(tags: Record<string, string>[], key: string): string | null {
  const hit = tags.find((t) => (t.name ?? t.property ?? '').toLowerCase() === key)
  return hit?.content ?? null
}

/** Title / description / share image as the document itself declares them. */
export function extractHtmlMeta(html: string): HtmlMeta {
  const tags = metaTags(html)
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  return {
    title: clean(titleTag) ?? clean(metaContent(tags, 'og:title')) ?? clean(h1),
    description: clean(metaContent(tags, 'description')) ?? clean(metaContent(tags, 'og:description')),
    ogImageUrl: clean(metaContent(tags, 'og:image')),
  }
}

/**
 * The page's palette, declared by the agent as
 * `<meta name="vizmaya:theme" content="background:#0a0e14; text:#e0ddd5; …">`
 * so the vizmaya header, footer and logo (./branding) can match it. The slots
 * are the story theme's (./styles StylePalette), which are also the logo's.
 */
export const THEME_META_NAME = 'vizmaya:theme'
export const THEME_SLOTS = ['background', 'surface', 'text', 'muted', 'line', 'accent', 'accent2', 'teal'] as const
export type ThemeSlot = (typeof THEME_SLOTS)[number]
export type ThemeColors = Partial<Record<ThemeSlot, string>>
/** The slots the branding can't do without. */
const REQUIRED_THEME_SLOTS: ThemeSlot[] = ['background', 'text', 'muted', 'accent', 'accent2', 'teal']
/** Hex only: these values are written into CSS and a script. */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** The `content` of the theme meta tag for a palette. */
export function themeMetaContent(colors: ThemeColors): string {
  return THEME_SLOTS.filter((k) => colors[k]).map((k) => `${k}:${colors[k]}`).join('; ')
}

/** The page's declared palette, or null when the tag is missing or lacks a required slot. */
export function extractThemeMeta(html: string): ThemeColors | null {
  const content = metaContent(metaTags(html), THEME_META_NAME)
  return content ? parseThemeMetaContent(content) : null
}

/** A theme tag's `content` (as stored in html_stories.theme_meta) as a palette, or null. */
export function parseThemeMetaContent(content: string): ThemeColors | null {
  const colors: ThemeColors = {}
  for (const pair of content.split(';')) {
    const [key, value] = pair.split(':').map((v) => v.trim())
    if ((THEME_SLOTS as readonly string[]).includes(key ?? '') && value && HEX.test(value)) {
      colors[key as ThemeSlot] = value
    }
  }
  return REQUIRED_THEME_SLOTS.every((k) => colors[k]) ? colors : null
}

/**
 * The page's format, as declared by `<meta name="vizmaya:format"
 * content="book">` (./formats). A page without the tag, or with a value that
 * isn't a format, is a scroll story (the lint flags the bad value).
 */
export function extractFormatMeta(html: string): HtmlStoryFormat {
  const raw = metaContent(metaTags(html), FORMAT_META_NAME)?.trim().toLowerCase()
  return isHtmlStoryFormat(raw) ? raw : 'scroll'
}

/** Does the document load a format's hosted runtime (…/formats/book@1.js)? */
function loadsRuntime(html: string, format: HtmlStoryFormat): boolean {
  return new RegExp(`/formats/${format}@\\d+\\.js`, 'i').test(html)
}

/** Format checks: the tag, the units, and the runtime the tag needs. */
function lintFormat(html: string, tags: Record<string, string>[], warnings: string[]): void {
  const raw = metaContent(tags, FORMAT_META_NAME)
  if (raw !== null && !isHtmlStoryFormat(raw.trim().toLowerCase())) {
    warnings.push(
      `<meta name="${FORMAT_META_NAME}" content="${raw}"> isn't a format; use scroll, book, board or deck. The page is listed as a scroll story.`,
    )
  }
  const format = extractFormatMeta(html)
  if (format === 'scroll') {
    const loaded = PAGED_HTML_STORY_FORMATS.find((f) => loadsRuntime(html, f))
    if (loaded && raw === null) {
      warnings.push(
        `The page loads the ${loaded} runtime but doesn't declare its format; add <meta name="${FORMAT_META_NAME}" content="${loaded}"> so it's listed as a ${HTML_STORY_FORMAT_META[loaded].label.toLowerCase()}.`,
      )
    }
    return
  }
  const unit = HTML_STORY_FORMAT_META[format].unit
  // An inline runtime (the page carries its own) sets html.<format>-on.
  if (!loadsRuntime(html, format) && !new RegExp(`\\b${format}-on\\b`).test(html)) {
    warnings.push(
      `The page declares the ${format} format but doesn't load its runtime: add <link rel="stylesheet" href="…/formats/${format}@1.css"> and <script src="…/formats/${format}@1.js"> (the brief has the URLs). Without it the page reads as one column.`,
    )
  }
  if (!/\bdata-unit\b/i.test(html)) {
    warnings.push(
      `No [data-unit] elements: in a ${format}, mark each ${unit} with data-unit so the runtime can build its charts and count-ups when the reader reaches it.`,
    )
  }
  if (/\bdata-step\b/i.test(html)) {
    warnings.push(
      `data-step is the scroll format's marker. In a ${format} nothing is scroll-triggered: mark each ${unit} with data-unit and let the runtime enter it.`,
    )
  }
}

/**
 * Aura scenes (aura.promad.design) are chosen per story after the HTML is
 * written, not by the agent: the slug lives in html_stories.aura and is laid
 * behind the page when it's served (./branding) and on its listing card.
 */
export const MAX_AURA_SLUG_LENGTH = 200

/**
 * An aura scene slug from what an editor pastes: the bare slug, or any
 * aura.promad.design URL that names it (`/scenes/<slug>`, `/embed/<slug>`).
 * Null when it isn't one.
 */
export function parseAuraSlug(input: string): string | null {
  let s = input.trim()
  const url = s.match(/^https?:\/\/[^/]+\/(?:scenes|embed|s)\/([^/?#]+)/i)
  if (url) {
    try {
      s = decodeURIComponent(url[1] ?? '')
    } catch {
      return null
    }
  }
  s = s.toLowerCase()
  return s.length <= MAX_AURA_SLUG_LENGTH && SAFE_SLUG.test(s) ? s : null
}

export interface HtmlLint {
  /** Problems that make the page unpublishable. */
  errors: string[]
  /** Things that will probably look broken once hosted; the page still saves. */
  warnings: string[]
}

/**
 * Checks an agent-posted document against the hosting contract in the brief.
 * Errors block the save; warnings are returned to the poster so it can fix
 * them in its next version.
 */
export function lintHtml(html: string): HtmlLint {
  const errors: string[] = []
  const warnings: string[] = []

  if (!html.trim()) {
    errors.push('HTML is empty.')
    return { errors, warnings }
  }
  const bytes = new TextEncoder().encode(html).length
  if (bytes > MAX_HTML_BYTES) {
    errors.push(
      `HTML is ${(bytes / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_HTML_BYTES / 1024 / 1024} MB. ` +
        'Host large images elsewhere and reference them by https URL instead of inlining them.',
    )
  }
  if (!/<html\b/i.test(html) || !/<body\b/i.test(html)) {
    errors.push('Post a complete document (<!doctype html><html>…<body>…</body></html>), not a fragment.')
  }

  if (!/^\s*(?:<!--[\s\S]*?-->\s*)*<!doctype html/i.test(html)) {
    warnings.push('Missing <!doctype html> as the first line; the page will render in quirks mode.')
  }
  if (!/<meta\b[^>]*name\s*=\s*["']?viewport/i.test(html)) {
    warnings.push('Missing <meta name="viewport" content="width=device-width, initial-scale=1">; phones will render a zoomed-out desktop page.')
  }
  const meta = extractHtmlMeta(html)
  if (!meta.title) warnings.push('Missing <title>; the story will be listed under its slug.')
  if (!meta.description) warnings.push('Missing <meta name="description">; link previews will have no summary.')
  if (!meta.ogImageUrl) warnings.push('Missing <meta property="og:image">; link previews will have no image.')
  lintFormat(html, metaTags(html), warnings)
  if (!extractThemeMeta(html)) {
    warnings.push(
      `Missing or incomplete <meta name="${THEME_META_NAME}">; the vizmaya header and footer won't match the page's colours. ` +
        `It needs hex values for ${REQUIRED_THEME_SLOTS.join(', ')}.`,
    )
  }

  const relative = new Set<string>()
  const attrRe = /\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = attrRe.exec(html))) {
    const url = (m[1] ?? '').trim()
    // Root-relative paths resolve against vizmaya.fyi, which is deliberate
    // (e.g. a link back to the home page), so only bare relative paths warn.
    if (/^(?:https?:|data:|blob:|mailto:|tel:|#|javascript:|\/)/i.test(url)) continue
    if (/^\{\{|\$\{/.test(url)) continue // templating left for runtime JS
    relative.add(url)
  }
  for (const url of [...relative].slice(0, 5)) {
    warnings.push(`"${url}" is a relative or local path and won't resolve once hosted. Inline it or use an absolute https URL.`)
  }
  if (relative.size > 5) warnings.push(`…and ${relative.size - 5} more relative paths.`)

  // Coarse on purpose: any try/catch in the document is taken as the guard.
  if (/\b(?:localStorage|sessionStorage|indexedDB)\b/.test(html) && !/\bcatch\b/.test(html)) {
    warnings.push(
      'The page uses browser storage. Stories are served in a sandbox where storage access throws; ' +
        'wrap it in try/catch so the page still works without it.',
    )
  }
  if (/\bdocument\.cookie\b/.test(html)) {
    warnings.push('The page reads or writes cookies; stories are sandboxed and have no cookie access.')
  }

  return { errors, warnings }
}
