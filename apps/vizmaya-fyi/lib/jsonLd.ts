/**
 * Schema.org JSON-LD builders. Pure functions returning plain objects — the
 * `<JsonLd>` server component serialises them into `application/ld+json` so the
 * structured data ships in the SSR/SSG HTML (crawlers and AI engines that don't
 * run JS still see it).
 *
 * Org identity lives in ORGANIZATION so every Article/Person can `publisher`/
 * reference the same `@id` entity, which is what builds the E-E-A-T graph.
 */

import type { Frontmatter } from '@vismay/viz-engine'

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://vizmaya.fyi'

const ORG_ID = `${SITE_URL}/#organization`
const WEBSITE_ID = `${SITE_URL}/#website`

/** Resolved author profile (from the Supabase `authors` registry). */
export interface AuthorRef {
  slug: string
  name: string
  /** Canonical profile URL, e.g. /authors/<slug>. Absolute or same-origin. */
  profileUrl?: string | null
  /** Socials / external profiles for Person.sameAs. */
  sameAs?: string[]
  role?: string | null
  bio?: string | null
  avatarUrl?: string | null
}

/** Google caps the indexed headline at ~110 chars. Trim cleanly on a word. */
export function clampHeadline(s: string, max = 110): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()
}

function abs(url: string): string {
  if (/^https?:\/\//.test(url)) return url
  return `${SITE_URL}${url.startsWith('/') ? '' : '/'}${url}`
}

/** NewsMediaOrganization — emitted once site-wide (in the root layout). */
export function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsMediaOrganization',
    '@id': ORG_ID,
    name: 'vizmaya',
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: abs('/android-chrome-512x512.png'),
      width: 512,
      height: 512,
    },
    sameAs: [] as string[],
  }
}

/** WebSite entity — pairs with the Organization in the layout. */
export function buildWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: 'vizmaya',
    url: SITE_URL,
    publisher: { '@id': ORG_ID },
  }
}

function personNode(a: AuthorRef) {
  const node: Record<string, unknown> = { '@type': 'Person', name: a.name }
  if (a.profileUrl) node.url = abs(a.profileUrl)
  if (a.sameAs?.length) node.sameAs = a.sameAs
  return node
}

/** Article or NewsArticle for a story page. */
export function buildArticleJsonLd(opts: {
  frontmatter: Frontmatter
  slug: string
  authors: AuthorRef[]
}) {
  const { frontmatter: fm, slug, authors } = opts
  const url = `${SITE_URL}/story/${slug}`
  const datePublished = fm.date
  const dateModified = fm.dateModified ?? fm.date
  const type = fm.articleType === 'news' ? 'NewsArticle' : 'Article'

  // Prefer an explicit cover; otherwise the per-story dynamic OG card.
  const image = fm.thumbnail ? abs(fm.thumbnail) : `${url}/opengraph-image`

  // Resolved registry authors win; fall back to a single Person from the
  // free-text byline. When the byline is blank, attribute the studio so the
  // article never carries an empty (invalid) author name.
  const bylineName = (fm.byline ?? '').trim()
  const authorNodes =
    authors.length > 0
      ? authors.map(personNode)
      : [bylineName ? { '@type': 'Person', name: bylineName } : { '@type': 'Organization', name: 'vizmaya' }]

  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': type,
    headline: clampHeadline(fm.title),
    description: fm.subtitle,
    image: [image],
    datePublished,
    dateModified,
    author: authorNodes,
    publisher: { '@id': ORG_ID },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
  }
  if (fm.keywords?.length) node.keywords = fm.keywords.join(', ')
  return node
}

export interface BreadcrumbItem {
  name: string
  url: string
}

/** BreadcrumbList from an ordered list of crumbs (names + same-origin paths). */
export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: abs(item.url),
    })),
  }
}

/** Person + ProfilePage for an author page. */
export function buildPersonJsonLd(author: AuthorRef) {
  const url = author.profileUrl ? abs(author.profileUrl) : `${SITE_URL}/authors/${author.slug}`
  const person: Record<string, unknown> = {
    '@type': 'Person',
    '@id': `${url}#person`,
    name: author.name,
    url,
  }
  if (author.role) person.jobTitle = author.role
  if (author.bio) person.description = author.bio
  if (author.avatarUrl) person.image = abs(author.avatarUrl)
  if (author.sameAs?.length) person.sameAs = author.sameAs
  person.worksFor = { '@id': ORG_ID }
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: person,
  }
}

export interface EpicStoryLink {
  slug: string
  title: string
}

/**
 * Epic landing — a CollectionPage with an ItemList of member stories. When the
 * epic carries evergreen explainer prose it's modelled as an Article too, so
 * the pillar page competes for explainer/reference queries.
 */
export function buildEpicJsonLd(opts: {
  slug: string
  name: string
  description?: string | null
  stories: EpicStoryLink[]
  explainer?: string | null
  datePublished?: string | null
  dateModified?: string | null
}) {
  const { slug, name, description, stories, explainer, datePublished, dateModified } = opts
  const url = `${SITE_URL}/${slug}`

  const collection: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${url}#collection`,
    name,
    url,
    isPartOf: { '@id': WEBSITE_ID },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: stories.map((s, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/story/${s.slug}`,
        name: s.title,
      })),
    },
  }
  if (description) collection.description = description

  if (!explainer) return collection

  // Pillar explainer present → also emit an Article for the evergreen page.
  const article: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: clampHeadline(name),
    description: description ?? undefined,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    publisher: { '@id': ORG_ID },
  }
  if (datePublished) article.datePublished = datePublished
  if (dateModified ?? datePublished) article.dateModified = dateModified ?? datePublished
  return [collection, article]
}
