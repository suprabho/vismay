/**
 * Pure helpers for agent-authored HTML stories: slug rules, metadata
 * extraction (title / description / og:image straight from the document), and
 * a light lint that tells the posting agent what will break once hosted.
 *
 * No Supabase / Node imports — safe for client components and the MCP server.
 */

export const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const MAX_SLUG_LENGTH = 80

/** Vercel functions reject request bodies over 4.5 MB; keep a margin. */
export const MAX_HTML_BYTES = 4 * 1024 * 1024

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
