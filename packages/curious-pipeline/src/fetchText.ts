/**
 * The publisher page behind a GDELT article, read once at detect time under
 * the web policy: robots.txt is honoured, the limiter paces one host, the
 * HTML is reduced to article text in memory, the detector takes its
 * evidence spans of at most 300 characters, and the text is discarded. The
 * document row keeps only a hash of it, so a later re-fetch can tell whether
 * the page changed.
 */

import { assertAllowed } from './policy'
import { createLimiter, getText, type Clock, type Limiter } from './http'
import { canonicalUrl, parseDate } from './text'

export const FETCH_TEXT_RULES = {
  maxHtmlBytes: 1_500_000,
  textCap: 60_000,
  timeoutMs: 20_000,
  minArticleChars: 400,
} as const

const decode = (s: string): string =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#?apos;/g, "'")
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

const ATTR = `(?:"([^"]*)"|'([^']*)')`
const meta = (html: string, key: string): string | null => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*?content=${ATTR}`, 'i')
  const re2 = new RegExp(`<meta[^>]+content=${ATTR}[^>]*?(?:property|name)=["']${key}["']`, 'i')
  const m = re.exec(html) ?? re2.exec(html)
  const v = m ? (m[1] ?? m[2] ?? '') : ''
  return v ? decode(v).trim() || null : null
}

export interface ArticleText {
  text: string
  title: string | null
  author: string | null
  publishedAt: string | null
  canonical: string | null
}

/** Reduce an HTML page to its article text (paragraph breaks kept) and the metadata around it. */
export function htmlToArticle(html: string): ArticleText {
  const title = meta(html, 'og:title') ?? (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? null)
  let published = meta(html, 'article:published_time') ?? meta(html, 'datePublished') ?? meta(html, 'date')
  if (!published) {
    const ld = /"datePublished"\s*:\s*"([^"]+)"/.exec(html)
    if (ld) published = ld[1]
  }
  const author = meta(html, 'author') ?? meta(html, 'article:author') ?? (/"author"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/.exec(html)?.[1] ?? null)
  const canonicalHref = /<link[^>]+rel=["']canonical["'][^>]*?href=(?:"([^"]*)"|'([^']*)')/i.exec(html)
  const canonicalUrlRaw = canonicalHref ? (canonicalHref[1] ?? canonicalHref[2] ?? null) : null

  let body = html.replace(/<!--[\s\S]*?-->/g, '')
  body = body.replace(/<(script|style|noscript|svg|iframe|form|nav|header|footer|aside|figure)\b[\s\S]*?<\/\1>/gi, ' ')
  const article = /<article\b[\s\S]*?<\/article>/i.exec(body)?.[0] ?? /<main\b[\s\S]*?<\/main>/i.exec(body)?.[0] ?? (/<body\b[\s\S]*?<\/body>/i.exec(body)?.[0] ?? body)
  const withBreaks = article
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|section)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  const text = decode(withBreaks)
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 1)
    .join('\n\n')
    .slice(0, FETCH_TEXT_RULES.textCap)
  const { iso } = parseDate(published ?? '')
  return {
    text,
    title: title ? decode(title).replace(/\s+\|.*$/, '').trim() : null,
    author,
    publishedAt: iso ?? (published && !Number.isNaN(Date.parse(published)) ? new Date(published).toISOString() : null),
    canonical: canonicalUrlRaw ? canonicalUrl(canonicalUrlRaw) : null,
  }
}

/** The subset of robots.txt that matters: does the `*` group (or ours) disallow this path. */
export function robotsAllows(robotsTxt: string, path: string, agent = 'vizmaya-curious'): boolean {
  const groups: Array<{ agents: string[]; disallow: string[]; allow: string[] }> = []
  let cur: { agents: string[]; disallow: string[]; allow: string[] } | null = null
  let lastWasAgent = false
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const [k, ...rest] = line.split(':')
    const v = rest.join(':').trim()
    const key = k.trim().toLowerCase()
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], disallow: [], allow: [] }
        groups.push(cur)
      }
      cur.agents.push(v.toLowerCase())
      lastWasAgent = true
    } else if (cur && (key === 'disallow' || key === 'allow')) {
      ;(key === 'disallow' ? cur.disallow : cur.allow).push(v)
      lastWasAgent = false
    } else lastWasAgent = false
  }
  const mine = groups.find((g) => g.agents.some((a) => a !== '*' && agent.toLowerCase().includes(a))) ?? groups.find((g) => g.agents.includes('*'))
  if (!mine) return true
  const matches = (rule: string) => {
    if (!rule) return false
    const re = new RegExp(`^${rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}`)
    return re.test(path)
  }
  const dis = mine.disallow.filter(matches).sort((a, b) => b.length - a.length)[0]
  const allow = mine.allow.filter(matches).sort((a, b) => b.length - a.length)[0]
  if (!dis) return true
  return !!allow && allow.length >= dis.length
}

export interface FetchArticleOptions {
  fetch?: typeof fetch
  clock?: Clock
  now?: Date
  /** One limiter per host, shared across a run. */
  limiters?: Map<string, Limiter>
  /** robots.txt per host, shared across a run; null means it could not be read (treated as allow). */
  robots?: Map<string, string | null>
  log?: (s: string) => void
}

/** The article text of a publisher page, or null when robots.txt forbids it or the page has no article. Never stored. */
export async function fetchArticleText(url: string, opts: FetchArticleOptions = {}): Promise<ArticleText | null> {
  const policy = assertAllowed('web', { method: 'html', now: opts.now })
  const u = new URL(url)
  const limiters = opts.limiters ?? new Map()
  let limiter = limiters.get(u.host)
  if (!limiter) {
    limiter = createLimiter({ minGapMs: policy.crawlDelayMs, baseCooldownMs: 30_000, clock: opts.clock })
    limiters.set(u.host, limiter)
  }
  const robots = opts.robots ?? new Map<string, string | null>()
  if (!robots.has(u.host)) {
    try {
      const r = await getText(`${u.origin}/robots.txt`, { fetch: opts.fetch, limiter, clock: opts.clock, timeoutMs: 10_000, attempts: 1, label: `${u.host} robots` })
      robots.set(u.host, /text\/plain/i.test(r.contentType ?? '') || !/<html/i.test(r.text) ? r.text : null)
    } catch {
      robots.set(u.host, null)
    }
  }
  const txt = robots.get(u.host)
  if (txt && !robotsAllows(txt, u.pathname + u.search)) {
    opts.log?.(`  · robots.txt disallows ${url}`)
    return null
  }
  const res = await getText(url, { fetch: opts.fetch, limiter, clock: opts.clock, timeoutMs: FETCH_TEXT_RULES.timeoutMs, attempts: 2, label: u.host, headers: { accept: 'text/html,application/xhtml+xml' } })
  if (res.contentType && !/html|xml/i.test(res.contentType)) return null
  const html = res.text.slice(0, FETCH_TEXT_RULES.maxHtmlBytes)
  const article = htmlToArticle(html)
  if (article.text.length < FETCH_TEXT_RULES.minArticleChars) return null
  return { ...article, canonical: article.canonical ?? canonicalUrl(res.finalUrl) }
}
