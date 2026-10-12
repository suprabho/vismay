/**
 * Search plumbing for hosted HTML stories (the editorials at /s/<slug>):
 * the canonical URL, the head tags a crawler needs that the agent's document
 * may have left out, NewsArticle JSON-LD, and the sitemap / RSS entries each
 * site lists its editorials in.
 *
 * The document is the author's, so nothing it declares is overridden: a tag
 * goes in only when the page lacks it. The canonical and JSON-LD always point
 * at the production origin (./apps), never the request's, so a preview or an
 * apex host never competes with the real URL.
 *
 * Pure — no Supabase / Node imports.
 */

import { HTML_STORY_APP_META, type HtmlStoryApp } from './apps'
import type { HtmlStorySummary } from './htmlStories'

/** What the SEO helpers need from a story row. */
export type HtmlStorySeoInput = Pick<
  HtmlStorySummary,
  'slug' | 'app' | 'title' | 'description' | 'ogImageUrl' | 'publishedAt' | 'updatedAt' | 'createdAt'
>

/** Each site's square publisher logo (served from its own public dir / app icon). */
const PUBLISHER_LOGO: Record<HtmlStoryApp, string> = {
  'vizmaya-fyi': '/android-chrome-512x512.png',
  footshorts: '/icons/icon-512.png',
  vizf1: '/icons/icon-512.png',
  viznba: '/icon.svg',
}

/** The subject each site's editorials are about, for JSON-LD `about` and the RSS category. */
const SITE_TOPIC: Record<HtmlStoryApp, string> = {
  'vizmaya-fyi': 'Data journalism',
  footshorts: 'Football',
  vizf1: 'Formula 1',
  viznba: 'NBA',
}

/**
 * The crawlable, server-rendered index of each site's editorials: the
 * breadcrumb parent and the RSS channel link. Footshorts' in-app tab
 * (/feed?tab=editorial, ./apps storiesPath) renders client-side, so its
 * public archive is /editorial.
 */
const EDITORIAL_HUB: Record<HtmlStoryApp, string> = {
  'vizmaya-fyi': '/stories',
  footshorts: '/editorial',
  vizf1: '/editorial',
  viznba: '/editorial',
}

export function editorialHubPath(app: HtmlStoryApp): string {
  return EDITORIAL_HUB[app]
}

/** Each site's editorial RSS feed (a route in the app at this path). */
const EDITORIAL_RSS: Record<HtmlStoryApp, string | null> = {
  'vizmaya-fyi': '/stories/rss.xml',
  footshorts: '/editorial/rss.xml',
  vizf1: '/editorial/rss.xml',
  viznba: '/editorial/rss.xml',
}

export function editorialRssUrl(app: HtmlStoryApp): string | null {
  const path = EDITORIAL_RSS[app]
  return path ? `${siteOrigin(app)}${path}` : null
}

/**
 * The host search engines should index, where it differs from ./apps siteUrl:
 * footshorts.com 307s to www, and a canonical or sitemap URL must be the final
 * one, not a redirect.
 */
const CANONICAL_ORIGIN: Partial<Record<HtmlStoryApp, string>> = {
  footshorts: 'https://www.footshorts.com',
}

/** The production origin canonicals, JSON-LD, sitemaps and RSS use. */
export function siteOrigin(app: HtmlStoryApp): string {
  return (CANONICAL_ORIGIN[app] ?? HTML_STORY_APP_META[app].siteUrl).replace(/\/$/, '')
}

/** The one URL a story is indexed under. */
export function htmlStoryCanonicalUrl(app: HtmlStoryApp, slug: string): string {
  return `${siteOrigin(app)}/s/${slug}`
}

function abs(app: HtmlStoryApp, url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${siteOrigin(app)}${url.startsWith('/') ? '' : '/'}${url}`
}

/** Google indexes ~110 characters of a headline; cut on a word. */
export function clampHeadline(s: string, max = 110): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space > 40 ? cut.slice(0, space) : cut).trimEnd()
}

function published(story: HtmlStorySeoInput): string {
  return story.publishedAt ?? story.createdAt
}

/** The site's publisher entity; the same @id on every page builds one graph. */
export function publisherJsonLd(app: HtmlStoryApp) {
  const origin = siteOrigin(app)
  return {
    '@type': 'NewsMediaOrganization',
    '@id': `${origin}/#organization`,
    name: HTML_STORY_APP_META[app].name,
    url: `${origin}/`,
    logo: { '@type': 'ImageObject', url: abs(app, PUBLISHER_LOGO[app]) },
  }
}

/** NewsArticle + BreadcrumbList for one story page. */
export function htmlStoryJsonLd(story: HtmlStorySeoInput): Record<string, unknown> {
  const { app } = story
  const meta = HTML_STORY_APP_META[app]
  const url = htmlStoryCanonicalUrl(app, story.slug)
  const article: Record<string, unknown> = {
    '@type': 'NewsArticle',
    '@id': `${url}#article`,
    headline: clampHeadline(story.title),
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    datePublished: published(story),
    dateModified: story.updatedAt,
    author: { '@type': 'Organization', name: meta.desk, url: `${siteOrigin(app)}/` },
    publisher: publisherJsonLd(app),
    articleSection: 'Editorial',
    about: { '@type': 'Thing', name: SITE_TOPIC[app] },
    inLanguage: 'en',
    isAccessibleForFree: true,
  }
  if (story.description) article.description = story.description
  if (story.ogImageUrl) article.image = [abs(app, story.ogImageUrl)]
  const breadcrumbs = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: meta.name, item: `${siteOrigin(app)}/` },
      { '@type': 'ListItem', position: 2, name: meta.storiesLabel, item: abs(app, EDITORIAL_HUB[app]) },
      { '@type': 'ListItem', position: 3, name: clampHeadline(story.title), item: url },
    ],
  }
  return { '@context': 'https://schema.org', '@graph': [article, breadcrumbs] }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** JSON for inside a <script>: no `</script>` or HTML comment openers can break out. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

/** The document's <head> with scripts dropped, so a string inside a script can't count as a tag. */
function headOf(html: string): string {
  const close = /<\/head\s*>/i.exec(html)
  const head = close ? html.slice(0, close.index) : html.slice(0, /<body\b/i.exec(html)?.index ?? html.length)
  return head.replace(/<script\b[\s\S]*?<\/script>/gi, '')
}

function hasMeta(head: string, key: string): boolean {
  const re = new RegExp(`<meta\\b[^>]*\\b(?:name|property)\\s*=\\s*["']?${key.replace(/[.:]/g, '\\$&')}["'\\s>]`, 'i')
  return re.test(head)
}

export interface HtmlStorySeoOptions {
  /**
   * Served chrome-less for a host app's WebView (`?embed=1`): the same story
   * at a second URL, so it is kept out of the index and points at the real one.
   */
  embed?: boolean
}

/**
 * The head tags to add to a story document: canonical, robots, the Open
 * Graph / Twitter / article tags it lacks, and the JSON-LD. Only what the
 * document doesn't already declare (JSON-LD of its own included).
 */
export function htmlStorySeoHead(html: string, story: HtmlStorySeoInput, { embed = false }: HtmlStorySeoOptions = {}): string {
  const head = headOf(html)
  const { app } = story
  const meta = HTML_STORY_APP_META[app]
  const url = htmlStoryCanonicalUrl(app, story.slug)
  const tags: string[] = []
  const metaTag = (attr: 'name' | 'property', key: string, value: string | null | undefined) => {
    if (value && !hasMeta(head, key)) tags.push(`<meta ${attr}="${key}" content="${escapeAttr(value)}">`)
  }

  if (!/<link\b[^>]*\brel\s*=\s*["']?canonical\b/i.test(head)) tags.push(`<link rel="canonical" href="${escapeAttr(url)}">`)
  if (embed) {
    tags.push('<meta name="robots" content="noindex, follow">')
  } else {
    metaTag('name', 'robots', 'index, follow, max-image-preview:large, max-snippet:-1')
  }
  metaTag('name', 'description', story.description)
  metaTag('property', 'og:type', 'article')
  metaTag('property', 'og:site_name', meta.name)
  metaTag('property', 'og:url', url)
  metaTag('property', 'og:title', story.title)
  metaTag('property', 'og:description', story.description)
  metaTag('property', 'og:image', story.ogImageUrl ? abs(app, story.ogImageUrl) : null)
  metaTag('property', 'og:locale', app === 'footshorts' ? 'en_GB' : 'en_US')
  metaTag('property', 'article:published_time', published(story))
  metaTag('property', 'article:modified_time', story.updatedAt)
  metaTag('property', 'article:section', SITE_TOPIC[app])
  metaTag('name', 'twitter:card', story.ogImageUrl ? 'summary_large_image' : 'summary')
  metaTag('name', 'twitter:title', story.title)
  metaTag('name', 'twitter:description', story.description)
  metaTag('name', 'twitter:image', story.ogImageUrl ? abs(app, story.ogImageUrl) : null)
  const rss = editorialRssUrl(app)
  if (rss && !/<link\b[^>]*\brel\s*=\s*["']?alternate\b[^>]*rss/i.test(head)) {
    tags.push(`<link rel="alternate" type="application/rss+xml" title="${escapeAttr(`${meta.name} ${meta.storiesLabel}`)}" href="${rss}">`)
  }
  if (!/application\/ld\+json/i.test(html)) {
    tags.push(`<script type="application/ld+json">${scriptJson(htmlStoryJsonLd(story))}</script>`)
  }
  return tags.join('')
}

/** The document with htmlStorySeoHead's tags at the end of its <head> (or the start of the page). */
export function injectHtmlStorySeo(html: string, story: HtmlStorySeoInput, opts: HtmlStorySeoOptions = {}): string {
  const tags = htmlStorySeoHead(html, story, opts)
  if (!tags) return html
  const close = /<\/head\s*>/i.exec(html)
  if (close) return html.slice(0, close.index) + tags + html.slice(close.index)
  const open = /<html\b[^>]*>/i.exec(html) ?? /<!doctype[^>]*>/i.exec(html)
  const at = open ? open.index + open[0].length : 0
  return html.slice(0, at) + tags + html.slice(at)
}

/** One sitemap row (Next's MetadataRoute.Sitemap shape, without importing next). */
export interface SitemapEntry {
  url: string
  lastModified?: Date
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
  images?: string[]
}

/**
 * Sitemap rows for a site's published stories. Next writes `url` and
 * `images` into the XML verbatim, so they are XML-escaped here: an image URL
 * with a query string (`?w=1280&q=80`) otherwise breaks the whole sitemap.
 */
export function htmlStorySitemapEntries(stories: HtmlStorySeoInput[]): SitemapEntry[] {
  return stories.map((s) => ({
    url: escapeXml(htmlStoryCanonicalUrl(s.app, s.slug)),
    lastModified: new Date(s.updatedAt),
    changeFrequency: 'weekly',
    priority: 0.8,
    ...(s.ogImageUrl ? { images: [escapeXml(abs(s.app, s.ogImageUrl))] } : {}),
  }))
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** RSS 2.0 for a site's editorials, newest first (the list is taken as given). */
export function htmlStoriesRss(app: HtmlStoryApp, stories: HtmlStorySeoInput[], limit = 50): string {
  const meta = HTML_STORY_APP_META[app]
  const rss = editorialRssUrl(app)
  const items = stories.slice(0, limit).map((s) => {
    const url = htmlStoryCanonicalUrl(app, s.slug)
    const parts = [
      `<title>${escapeXml(s.title)}</title>`,
      `<link>${escapeXml(url)}</link>`,
      `<guid isPermaLink="true">${escapeXml(url)}</guid>`,
      `<pubDate>${new Date(published(s)).toUTCString()}</pubDate>`,
      `<category>${escapeXml(SITE_TOPIC[app])}</category>`,
    ]
    if (s.description) parts.push(`<description>${escapeXml(s.description)}</description>`)
    if (s.ogImageUrl) parts.push(`<media:content url="${escapeXml(abs(app, s.ogImageUrl))}" medium="image"/>`)
    return `<item>${parts.join('')}</item>`
  })
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><channel>` +
    `<title>${escapeXml(`${meta.name} · ${meta.storiesLabel}`)}</title>` +
    `<link>${escapeXml(abs(app, EDITORIAL_HUB[app]))}</link>` +
    (rss ? `<atom:link href="${escapeXml(rss)}" rel="self" type="application/rss+xml"/>` : '') +
    `<description>${escapeXml(`${SITE_TOPIC[app]} editorials from the ${meta.desk}`)}</description>` +
    `<language>en</language>` +
    (stories[0] ? `<lastBuildDate>${new Date(stories[0].updatedAt).toUTCString()}</lastBuildDate>` : '') +
    items.join('') +
    `</channel></rss>`
  )
}

/** Response for a site's /editorial/rss.xml route. */
export function htmlStoriesRssResponse(app: HtmlStoryApp, stories: HtmlStorySeoInput[]): Response {
  return new Response(htmlStoriesRss(app, stories), {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, s-maxage=600, stale-while-revalidate=86400',
    },
  })
}
