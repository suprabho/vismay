/**
 * Three layers of dedupe. Exact: canonical URL and hashes (text.ts).
 * Lexical: IDF-weighted cosine over claim tokens, greedy single-pass
 * clustering with the earliest claim as the representative. Provenance:
 * every supporting source carries an independence group, so twenty
 * articles that all repeat one wire story, one book or one interview count
 * as one lineage when the grader asks how many independent sources agree.
 */

import { buildIdf, cosine, domainOf, normalizeText, sha1, sha256, tokens, type Idf } from './text'
import type { ClaimSourceUpsert, SourceId } from './types'

export { canonicalUrl } from './text'

export const DEDUPE_RULES = {
  /** Cosine at or above which two claims are the same claim. */
  clusterThreshold: 0.62,
  /** A sentence this long shared verbatim between two documents is copy lineage. */
  sharedSentenceWords: 12,
  /** Cosine at or above which two proposed claims tell the same story (looser: different angles on one anecdote). */
  storyThreshold: 0.45,
  /** Or: this many shared words (numbers aside)… */
  storySharedWords: 5,
  /** …making up at least this share of the shorter claim's words. */
  storySharedShare: 0.4,
} as const

export const claimHash = (text: string): string => sha256(normalizeText(text))

export interface ClusterInput {
  id: string
  text: string
  /** ISO; the earliest in a cluster is its representative. */
  publishedAt?: string | null
}

export interface Cluster {
  representative: string
  members: string[]
}

/** Greedy clustering: each claim joins the first cluster whose representative is near enough. */
export function lexicalClusters(claims: ClusterInput[], opts: { threshold?: number; idf?: Idf } = {}): Cluster[] {
  const threshold = opts.threshold ?? DEDUPE_RULES.clusterThreshold
  const toks = new Map(claims.map((c) => [c.id, tokens(c.text)]))
  const idf = opts.idf ?? buildIdf(toks.values())
  const ordered = [...claims].sort((a, b) => (a.publishedAt ?? '9999').localeCompare(b.publishedAt ?? '9999') || a.id.localeCompare(b.id))
  const clusters: Cluster[] = []
  for (const c of ordered) {
    const t = toks.get(c.id)!
    let best: Cluster | null = null
    let bestScore = 0
    for (const cl of clusters) {
      const s = cosine(t, toks.get(cl.representative)!, idf)
      if (s >= threshold && s > bestScore) {
        best = cl
        bestScore = s
      }
    }
    if (best) best.members.push(c.id)
    else clusters.push({ representative: c.id, members: [c.id] })
  }
  return clusters
}

const WIRE = /\b(AP|Associated Press|Reuters|AFP|Agence France-Presse|PTI|Press Trust of India|ANI|IANS|Xinhua|TASS|UPI|dpa|EFE|Kyodo|Bloomberg)\b/

export interface LineageInput {
  doi?: string | null
  isbn?: string | null
  /** A sentence of 12+ words shared verbatim with another document (normalised). */
  sharedSentence?: string | null
  /** Byline or text the wire credit may sit in. */
  byline?: string | null
  text?: string | null
  /** The extractor's attribution: one interview retold many times is one lineage. */
  speaker?: string | null
  year?: number | null
  publisher?: string | null
  url?: string | null
  sourceId?: SourceId
}

/**
 * The independence group, by precedence: the DOI, the ISBN, a shared
 * sentence (copy), the wire agency, the attributed speaker and year, then
 * the publisher or registrable domain.
 */
export function independenceGroup(i: LineageInput): string {
  if (i.doi) return `doi:${i.doi.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}`
  if (i.isbn) return `isbn:${i.isbn.replace(/[^0-9Xx]/g, '').toUpperCase()}`
  if (i.sharedSentence) return `quote:${sha1(normalizeText(i.sharedSentence)).slice(0, 16)}`
  const wire = WIRE.exec(`${i.byline ?? ''} ${(i.text ?? '').slice(0, 400)}`)
  if (wire) return `wire:${wire[1].toLowerCase().replace(/\s+/g, '-')}`
  if (i.speaker) return `attr:${normalizeText(i.speaker).replace(/\s+/g, '-')}:${i.year ?? 'x'}`
  const pub = i.url ? domainOf(i.url) : ''
  if (pub && !/^(loc\.gov|europeana\.eu|gallica\.bnf\.fr)$/.test(pub)) return `pub:${pub}`
  if (i.publisher) return `pub:${normalizeText(i.publisher).replace(/\s+/g, '-').slice(0, 60)}`
  return `pub:${pub || i.sourceId || 'unknown'}`
}

/** Distinct lineages among the sources that support or cite a claim. */
export function provenanceDedupe(sources: Array<Pick<ClaimSourceUpsert, 'relation' | 'independence_group'>>): { groups: string[]; nSources: number; nDerived: number } {
  const groups = new Set<string>()
  let nSources = 0
  let nDerived = 0
  for (const s of sources) {
    if (s.relation === 'supports' || s.relation === 'cites') {
      groups.add(s.independence_group)
      nSources++
    }
    if (s.relation === 'derived_from') {
      nSources++
      nDerived++
    }
  }
  return { groups: [...groups], nSources, nDerived }
}

export interface StoryInput {
  text: string
  subject?: string | null
  entities?: Array<{ name: string; kind: string }>
}

/** Entity kinds that name the story itself; orgs and places are shared by unrelated stories. */
const STORY_ENTITY_KINDS = new Set(['person', 'work', 'event'])

const storyKeys = (s: StoryInput): Set<string> => {
  const keys = new Set<string>()
  const subject = normalizeText(s.subject ?? '')
  if (subject) keys.add(subject)
  for (const e of s.entities ?? []) if (STORY_ENTITY_KINDS.has(e.kind) && normalizeText(e.name)) keys.add(normalizeText(e.name))
  return keys
}

/**
 * Greedy story dedupe, in order (earlier wins): a claim is dropped when it
 * shares a subject or a person/work/event with a claim already kept, or when
 * its words are near enough to a kept claim or to one already on the desk.
 * Three angles on one anecdote are one story, whatever their wording.
 */
export function storyDedupe<T extends StoryInput>(items: T[], opts: { existing?: string[]; threshold?: number } = {}): { kept: T[]; dupes: Array<{ item: T; of: string }> } {
  const threshold = opts.threshold ?? DEDUPE_RULES.storyThreshold
  const words = (t: Set<string>) => [...t].filter((x) => !x.includes(':'))
  const existing = (opts.existing ?? []).map((t) => ({ text: t, toks: tokens(t) }))
  const toks = items.map((i) => tokens(i.text))
  const idf = buildIdf([...toks, ...existing.map((e) => e.toks)])
  const near = (a: Set<string>, b: Set<string>): boolean => {
    if (cosine(a, b, idf) >= threshold) return true
    const wa = words(a)
    const wb = words(b)
    const shared = wa.filter((x) => b.has(x)).length
    return shared >= DEDUPE_RULES.storySharedWords && shared >= DEDUPE_RULES.storySharedShare * Math.min(wa.length, wb.length)
  }
  const kept: Array<{ item: T; toks: Set<string>; keys: Set<string> }> = []
  const dupes: Array<{ item: T; of: string }> = []
  items.forEach((item, i) => {
    const keys = storyKeys(item)
    const sameAs =
      kept.find((k) => [...keys].some((x) => k.keys.has(x)) || near(toks[i], k.toks))?.item.text ??
      existing.find((e) => near(toks[i], e.toks))?.text
    if (sameAs) dupes.push({ item, of: sameAs })
    else kept.push({ item, toks: toks[i], keys })
  })
  return { kept: kept.map((k) => k.item), dupes }
}
