/**
 * The Curious Desk's LLM path: propose with web search, check against the
 * pages, queue for review. It replaces the collect → detect → grade → verify
 * workers (wound down 2026-11-05) with one on-demand run of three stages:
 *
 *   1. Research — a model with the AI Gateway's web search looks for
 *      surprising, specific, datable facts and anecdotes for the brief (era,
 *      theme, region, a free hint), searching for corroboration and for
 *      debunks. Every search result it saw is kept with its real URL.
 *   2. Propose — a schema pass turns the notes into atomic claims, each
 *      citing results by number. A citation that is not a result the search
 *      returned is dropped, so a model cannot invent a source.
 *   3. Check — each cited page is read once (robots.txt honoured, text never
 *      stored; the search snippet stands in when the page cannot be read),
 *      and a second model judges the claim against those excerpts: verdict,
 *      grade A to E, which source is primary, which retells which, the
 *      supported core and the embellishment, and a verbatim evidence quote
 *      per source. A quote that cannot be located in its excerpt does not
 *      count. A claim with no located supporting quote, or judged
 *      unsupported, is dropped; a contradicted one is kept as grade E (a
 *      myth is a story too) with the contradiction flag.
 *
 * Survivors are written to the same tables the review queue reads
 * (curious_documents with source 'web-search', curious_claims as in_review,
 * curious_claim_sources verified by 'llm-check'). The model calls and the
 * page reader are injectable, so the tests run on fakes.
 */

import { z } from 'zod'
import { locateQuote } from './extract'
import { independenceGroup } from './dedupe'
import { GRADE_LABELS } from './grade'
import { ERAS, eraOf, REGION_IDS, THEME_IDS, THEME_NAMES, type ThemeId } from './taxonomy'
import { canonicalUrl, clip, domainOf, normalizeText, parseDate, sha1, sha256, tokens } from './text'
import type { ClaimFlag, ClaimKind, EntityKind, Grade } from './types'

export const LLM_VERSION = 'curious-llm-v1-2026-11'
export const DEFAULT_RESEARCH_MODEL = 'text.sonnet'
export const DEFAULT_PROPOSE_MODEL = 'text.sonnet'
export const DEFAULT_CHECK_MODEL = 'text.sonnet'
export const LLM_RULES = {
  maxCount: 8,
  maxSourcesPerClaim: 4,
  excerptChars: 2400,
  quoteWindow: 900,
  snippetChars: 1200,
} as const

// ── The brief ────────────────────────────────────────────────────────────

export interface LlmBrief {
  /** An ERAS id, or empty for any. */
  era?: string | null
  /** A THEME_IDS id, or empty for any. */
  theme?: string | null
  /** A REGION_IDS id, or empty for any. */
  region?: string | null
  /** Free text: a subject, a person, a place, an angle. */
  hint?: string | null
  /** Claims to propose (1 to 8). */
  count: number
}

const ERA_BY_ID = new Map(ERAS.map((e) => [e.id, e]))
const yearLabel = (y: number) => (y < 0 ? `${-y + 1} BCE` : String(y))

export function describeBrief(b: LlmBrief): string {
  const parts: string[] = []
  const era = b.era ? ERA_BY_ID.get(b.era) : null
  if (era) parts.push(`Era: ${era.name} (${era.from == null ? 'before' : yearLabel(era.from)}${era.to == null ? ' onwards' : ` to ${yearLabel(era.to)}`})`)
  if (b.theme && (THEME_IDS as readonly string[]).includes(b.theme)) parts.push(`Theme: ${THEME_NAMES[b.theme as ThemeId]}`)
  if (b.region && (REGION_IDS as readonly string[]).includes(b.region) && b.region !== 'world') parts.push(`Region: ${b.region.replace(/-/g, ' ')}`)
  if (b.hint?.trim()) parts.push(`Angle from the editor: ${b.hint.trim().slice(0, 300)}`)
  return parts.length ? parts.join('\n') : 'Any era, theme or region: surprise us.'
}

// ── Stage 1: research ───────────────────────────────────────────────────

export const RESEARCH_SYSTEM = `You research for the Curious Desk, a daily story slot built on one surprising, well-sourced fact or anecdote. You have a web_search tool.

What the desk wants: specific, datable, checkable claims that make a reader say "wait, really?" Firsts, lasts, onlys, odd numbers, twists, who-did-what-when, an object with a strange history, a word with a surprising origin. Not trivia everyone knows, not opinion, not generic background, not anything about a private living person.

How to research:
- Search broadly first for candidates, then, for each candidate you keep, search again for corroboration from an independent source and for a debunk ("myth", "hoax", "fact check", "apocryphal", "actually").
- Prefer primary and institutional sources: archives, museums, libraries, universities, peer-reviewed work, government records, newspapers of record, the original publication. Treat listicles, content farms, Quora, Reddit, Pinterest and AI-written pages as leads only.
- When many pages say the same thing, find out whether they all trace back to one account; that is one lineage, not many confirmations.
- Keep going until you have more candidates than asked for, so weak ones can be dropped.

When you are done, write plain notes, one block per candidate: the claim in one sentence, the URLs that support it (and which one is closest to a primary source), any URL that contradicts or hedges it, and what part is embellishment.`

export function researchPrompt(b: LlmBrief, avoid: string[]): string {
  const lines = [`Find ${Math.min(LLM_RULES.maxCount, Math.max(1, b.count)) + 3} candidate claims for this brief:`, '', describeBrief(b)]
  if (avoid.length) lines.push('', 'The desk already has these; find different ones:', ...avoid.slice(0, 60).map((a) => `- ${a}`))
  return lines.join('\n')
}

// ── Stage 2: propose ────────────────────────────────────────────────────

export interface SearchResultLite {
  url: string
  title: string
  snippet: string
  date: string | null
}

export const ProposedClaimSchema = z.object({
  text: z.string().max(400).describe('One atomic, self-contained claim in plain past-tense English. Name the people, works and places; no pronouns.'),
  kind: z.enum(['fact', 'anecdote', 'number', 'quote']),
  subject: z.string().max(120).describe('Who or what the claim is about.'),
  theme: z.enum(THEME_IDS),
  region: z.enum(REGION_IDS).describe('Where it happened; world when global or unknown.'),
  entities: z.array(z.object({ name: z.string().max(120), kind: z.enum(['person', 'org', 'place', 'work', 'event', 'other']) })).max(8),
  year_from: z.number().int().nullable().describe('The year the claim is about (negative for BCE), or null.'),
  year_to: z.number().int().nullable(),
  place: z.string().max(120).nullable(),
  country_code: z.string().length(2).nullable().describe('ISO 3166-1 alpha-2 of the modern country, or null.'),
  is_quotation: z.boolean().describe('True when the claim is that someone said these words.'),
  sensitive: z.boolean().describe('True when the claim concerns crime, health, minors, sexuality or a private person.'),
  why_curious: z.string().max(240).describe('One line: why a reader would stop for this.'),
  sources: z
    .array(z.object({ result: z.number().int().describe('The number of a search result in the list.'), relation: z.enum(['supports', 'contradicts']) }))
    .min(1)
    .max(LLM_RULES.maxSourcesPerClaim)
    .describe('Search results by number. Only numbers from the list. Put the best source first.'),
})
export type ProposedClaim = z.infer<typeof ProposedClaimSchema>
export const ProposalSchema = z.object({ claims: z.array(ProposedClaimSchema).max(12) })

export const PROPOSE_SYSTEM = `You turn a researcher's notes into atomic claims for a fact-checking desk.
- One claim per distinct checkable proposition; split compound ones. Each claim is self-contained.
- Cite sources ONLY by the numbers of the search results listed. Never cite a URL that is not in the list. A claim with no listed source that supports it is left out.
- Keep the hedges: if the sources say "reportedly" or "legend has it", say so in the claim.
- Keep the specific and surprising; drop the generic, the opinion, the well known, and anything about a private living person.
- Return the strongest claims first, at most the number asked for.`

export function proposePrompt(b: LlmBrief, notes: string, results: SearchResultLite[]): string {
  const list = results
    .map((r, i) => `[${i + 1}] ${r.title || domainOf(r.url)} (${domainOf(r.url)}${r.date ? `, ${r.date}` : ''})\n${r.url}\n${clip(r.snippet.replace(/\s+/g, ' '), 400)}`)
    .join('\n\n')
  return `Brief:\n${describeBrief(b)}\n\nReturn at most ${Math.min(LLM_RULES.maxCount, Math.max(1, b.count))} claims.\n\nResearcher's notes:\n"""\n${notes.slice(0, 20_000)}\n"""\n\nSearch results:\n${list}`
}

/** Map each claim's cited numbers to real results; drop citations outside the list and claims left with no supporting source. */
export function resolveCitations(claims: ProposedClaim[], results: SearchResultLite[]): Array<{ claim: ProposedClaim; sources: Array<{ result: SearchResultLite; relation: 'supports' | 'contradicts' }> }> {
  const out: Array<{ claim: ProposedClaim; sources: Array<{ result: SearchResultLite; relation: 'supports' | 'contradicts' }> }> = []
  for (const claim of claims) {
    const seen = new Set<string>()
    const sources: Array<{ result: SearchResultLite; relation: 'supports' | 'contradicts' }> = []
    for (const s of claim.sources) {
      const r = results[s.result - 1]
      if (!r) continue
      const key = canonicalUrl(r.url)
      if (seen.has(key)) continue
      seen.add(key)
      sources.push({ result: r, relation: s.relation })
    }
    if (sources.some((s) => s.relation === 'supports')) out.push({ claim, sources: sources.slice(0, LLM_RULES.maxSourcesPerClaim) })
  }
  return out
}

// ── Stage 3: check ──────────────────────────────────────────────────────

export interface PageText {
  text: string
  title: string | null
  author: string | null
  publishedAt: string | null
}

/** The part of a page the checker reads: around the claim's words, capped. */
export function excerptFor(claimText: string, pageText: string, maxChars: number = LLM_RULES.excerptChars): string {
  if (pageText.length <= maxChars) return pageText
  const want = tokens(claimText)
  const paras = pageText.split(/\n{2,}/).map((p, i) => ({ p, i, score: [...tokens(p)].filter((t) => want.has(t)).length }))
  const ranked = [...paras].sort((a, b) => b.score - a.score || a.i - b.i)
  const picked: typeof paras = []
  let used = 0
  for (const para of ranked) {
    if (para.score === 0 && picked.length) break
    const piece = clip(para.p, LLM_RULES.quoteWindow)
    if (used + piece.length > maxChars && picked.length) break
    picked.push({ ...para, p: piece })
    used += piece.length + 2
  }
  return picked
    .sort((a, b) => a.i - b.i)
    .map((x) => x.p)
    .join('\n\n')
    .slice(0, maxChars)
}

export const CheckSchema = z.object({
  verdict: z.enum(['supported', 'partly', 'unsupported', 'contradicted']).describe('supported: the sources state the claim; partly: they support a core but not all of it; unsupported: they do not state it; contradicted: a credible source says it is false.'),
  grade: z.enum(['A', 'B', 'C', 'D', 'E']),
  core: z.string().max(400).describe('What the sources actually support, in one sentence.'),
  embellishment: z.string().max(300).nullable().describe('The part of the claim the sources do not support, or null.'),
  rewrite: z.string().max(400).nullable().describe('A tighter wording of the claim that says only what the sources support, or null when the claim is already right.'),
  sources: z.array(
    z.object({
      id: z.string().describe('S1, S2 … as labelled.'),
      relation: z.enum(['supports', 'contradicts', 'mentions']),
      is_primary: z.boolean().describe('A first-hand or original record: the document itself, the original publication, an archive or official record.'),
      derived_from: z.string().nullable().describe('The id of another listed source this one evidently retells, or null when it is independent.'),
      quality: z.number().min(0).max(1).describe('Institutional quality: 1 archive, museum, university, peer review; 0.7 newspaper of record, reference work; 0.4 general web; 0.1 content farm, forum, listicle.'),
      quote: z.string().max(300).describe('A verbatim span of this source’s excerpt, at most 300 characters, that states (or contradicts) the claim. Copy it exactly. Empty when there is none.'),
    }),
  ),
  is_hearsay: z.boolean().describe('True when the best sources only report it as "reportedly", "it is said", "legend has it".'),
  is_anonymous: z.boolean().describe('True when no source names who it comes from.'),
  speaker: z.string().max(120).nullable().describe('Whom the sources attribute the claim to, if anyone.'),
  notes: z.array(z.string().max(240)).max(6).describe('Short notes for the human reviewer: what holds, what does not, what to check.'),
})
export type CheckResult = z.infer<typeof CheckSchema>

export const CHECK_SYSTEM = `You are the fact checker on the Curious Desk. You get one claim and excerpts of the pages cited for it, labelled S1, S2 … Judge the claim ONLY on these excerpts, not on what you remember.

Grades:
A: ${GRADE_LABELS.A}.
B: ${GRADE_LABELS.B}.
C: ${GRADE_LABELS.C}.
D: ${GRADE_LABELS.D}.
E: ${GRADE_LABELS.E}.

Rules:
- Count lineages, not pages: a page that retells another listed page is derived_from it. Several retellings of one unsourced account are D at best.
- A quote must be copied exactly from that source's excerpt, at most 300 characters. If no span states the claim, leave the quote empty. Never paraphrase into the quote.
- Split the supported core from the embellishment. If the claim says more than the sources do, give a rewrite that says only what they support.
- Be strict: an uncorroborated single web page is C at most; a claim the excerpts do not state is unsupported.`

export function checkPrompt(claim: { text: string; why_curious?: string }, sources: Array<{ id: string; url: string; title: string | null; date: string | null; relation: string; excerpt: string; fromSnippet: boolean }>): string {
  const blocks = sources.map(
    (s) => `${s.id} — ${s.title ?? domainOf(s.url)} (${domainOf(s.url)}${s.date ? `, ${s.date}` : ''}; cited as ${s.relation}${s.fromSnippet ? '; only the search snippet could be read' : ''})\n${s.url}\n"""\n${s.excerpt}\n"""`,
  )
  return `Claim:\n${claim.text}\n\nSources:\n\n${blocks.join('\n\n')}`
}

// ── The run ─────────────────────────────────────────────────────────────

export interface ResearchFn {
  (o: { system: string; prompt: string; model: string }): Promise<{ text: string; results: Array<SearchResultLite & { query?: string }>; queries: string[]; modelUsed: string }>
}
export interface GenerateFn {
  <S extends z.ZodType>(o: { system: string; prompt: string; schema: S; model: string; metadata?: Record<string, string> }): Promise<{ result: z.infer<S>; modelUsed: string }>
}
export interface ReadPageFn {
  (url: string): Promise<PageText | null>
}

export interface CheckedSource {
  url: string
  canonical_url: string
  title: string | null
  publisher: string
  author: string | null
  published_at: string | null
  published_precision: 'minute' | 'day' | 'month' | 'year' | 'unknown'
  relation: 'supports' | 'contradicts' | 'mentions'
  is_primary: boolean
  derived_from: string | null
  independence_group: string
  quality: number
  quote: string | null
  quote_found: boolean
  read: 'page' | 'snippet'
  query: string | null
}

export interface CheckedClaim {
  text: string
  text_norm: string
  claim_hash: string
  original_text: string
  kind: ClaimKind
  subject: string
  theme: string
  region: string
  era: string | null
  entities: Array<{ name: string; kind: EntityKind }>
  year_from: number | null
  year_to: number | null
  place: string | null
  country_code: string | null
  is_quotation: boolean
  is_hearsay: boolean
  is_anonymous: boolean
  speaker: string | null
  sensitive: boolean
  grade: Grade
  score: number
  flags: ClaimFlag[]
  verdict: CheckResult['verdict']
  core: string
  embellishment: string | null
  why_curious: string
  notes: string[]
  /** Index into sources of the one whose quote is the claim's evidence. */
  evidence: number
  sources: CheckedSource[]
  models: { research: string; propose: string; check: string }
}

export interface Dropped {
  text: string
  reason: string
}

export interface LlmRunResult {
  brief: LlmBrief
  queries: string[]
  results: number
  proposed: number
  kept: CheckedClaim[]
  dropped: Dropped[]
}

/** A score in the grade's band, so the queue's sort and the desk's weights read it like the grader's. */
export const GRADE_SCORE: Record<Grade, number> = { A: 0.85, B: 0.65, C: 0.47, D: 0.32, E: 0.12 }

export interface RunDeps {
  research: ResearchFn
  generate: GenerateFn
  readPage: ReadPageFn
  models?: { research?: string; propose?: string; check?: string }
  /** Claim texts the desk already has (to avoid) and hashes (to skip). */
  avoid?: string[]
  knownHashes?: Set<string>
  concurrency?: number
  log?: (s: string) => void
}

async function mapPool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i], i)
      }
    }),
  )
  return out
}

/** Check one proposed claim against its cited pages. Returns the kept claim or why it was dropped. */
export async function checkOne(
  p: { claim: ProposedClaim; sources: Array<{ result: SearchResultLite & { query?: string }; relation: 'supports' | 'contradicts' }> },
  deps: Pick<RunDeps, 'generate' | 'readPage' | 'log'> & { model: string; pages: Map<string, Promise<PageText | null>> },
): Promise<{ kept: Omit<CheckedClaim, 'models'> & { checkModel: string } } | { dropped: Dropped }> {
  const read = await Promise.all(
    p.sources.map(async (s, i) => {
      const key = canonicalUrl(s.result.url)
      let page = deps.pages.get(key)
      if (!page) {
        page = deps.readPage(s.result.url).catch(() => null)
        deps.pages.set(key, page)
      }
      const got = await page
      const fromSnippet = !got || !got.text.trim()
      const full = fromSnippet ? clip(s.result.snippet, LLM_RULES.snippetChars) : got!.text
      return { id: `S${i + 1}`, s, page: got, fromSnippet, excerpt: excerptFor(p.claim.text, full) }
    }),
  )
  const usable = read.filter((r) => r.excerpt.trim().length > 0)
  if (!usable.length) return { dropped: { text: p.claim.text, reason: 'none of the cited pages could be read' } }

  const { result: check, modelUsed } = await deps.generate({
    system: CHECK_SYSTEM,
    prompt: checkPrompt(p.claim, usable.map((r) => ({ id: r.id, url: r.s.result.url, title: r.page?.title ?? r.s.result.title ?? null, date: r.s.result.date, relation: r.s.relation, excerpt: r.excerpt, fromSnippet: r.fromSnippet }))),
    schema: CheckSchema,
    model: deps.model,
    metadata: { feature: 'curious-llm-check' },
  })
  if (check.verdict === 'unsupported') return { dropped: { text: p.claim.text, reason: `checker: unsupported${check.notes[0] ? ` (${check.notes[0]})` : ''}` } }

  const byId = new Map(check.sources.map((s) => [s.id.trim().toUpperCase(), s]))
  const sources: CheckedSource[] = usable.map((r) => {
    const j = byId.get(r.id)
    const loc = j?.quote ? locateQuote(r.excerpt, j.quote) : null
    const quote = loc ? clip(loc.exact, 300) : null
    const pub = parseDate(r.page?.publishedAt ?? r.s.result.date ?? '')
    const url = r.s.result.url
    return {
      url,
      canonical_url: canonicalUrl(url),
      title: r.page?.title ?? (r.s.result.title || null),
      publisher: domainOf(url),
      author: r.page?.author ?? null,
      published_at: pub.iso,
      published_precision: pub.precision,
      relation: j?.relation ?? (r.s.relation === 'contradicts' ? 'contradicts' : 'mentions'),
      is_primary: !!j?.is_primary,
      derived_from: j?.derived_from?.trim().toUpperCase() || null,
      independence_group: '',
      quality: Math.max(0, Math.min(1, j?.quality ?? 0.4)),
      quote,
      quote_found: !!loc,
      read: r.fromSnippet ? 'snippet' : 'page',
      query: r.s.result.query ?? null,
    }
  })
  // Lineage: a source derived from another listed one shares its group.
  const ids = usable.map((r) => r.id)
  const groupOf = (i: number, depth = 0): string => {
    const s = sources[i]
    const parent = s.derived_from ? ids.indexOf(s.derived_from) : -1
    if (parent >= 0 && parent !== i && depth < 4) return groupOf(parent, depth + 1)
    return independenceGroup({ url: s.url, publisher: s.publisher, speaker: check.speaker, year: p.claim.year_from, sourceId: 'web-search' })
  }
  sources.forEach((s, i) => (s.independence_group = groupOf(i)))

  const supporting = sources.map((s, i) => ({ s, i })).filter(({ s }) => s.relation === 'supports' && s.quote_found)
  if (!supporting.length) {
    if (check.verdict === 'contradicted') {
      const contra = sources.map((s, i) => ({ s, i })).filter(({ s }) => s.relation === 'contradicts' && s.quote_found)
      if (!contra.length) return { dropped: { text: p.claim.text, reason: 'contradicted, and no quote could be located in any source' } }
    } else return { dropped: { text: p.claim.text, reason: 'no supporting quote could be found word for word in the pages' } }
  }
  const pick = (supporting.length ? supporting : sources.map((s, i) => ({ s, i })).filter(({ s }) => s.quote_found)).sort(
    (a, b) => Number(b.s.is_primary) - Number(a.s.is_primary) || b.s.quality - a.s.quality || Number(b.s.read === 'page') - Number(a.s.read === 'page'),
  )[0]

  const lineages = new Set(sources.filter((s) => s.relation === 'supports').map((s) => s.independence_group)).size
  let grade: Grade = check.verdict === 'contradicted' ? 'E' : check.grade
  // Guard rails the model cannot talk past: one lineage is never A, and support read only from search snippets is C at most.
  if (grade === 'A' && lineages < 2) grade = 'B'
  if ((grade === 'A' || grade === 'B') && !sources.some((s) => s.read === 'page' && s.quote_found && s.relation === 'supports')) grade = 'C'

  const flags = new Set<ClaimFlag>()
  if (check.verdict === 'contradicted' || sources.some((s) => s.relation === 'contradicts')) flags.add('contradiction')
  if (p.claim.sensitive) flags.add('sensitive')
  if (check.is_anonymous && sources.filter((s) => s.relation === 'supports').length >= 3 && lineages <= 1) flags.add('anonymous-repetition')
  if (sources.filter((s) => s.relation === 'supports').length >= 3 && lineages <= 1 && !sources.some((s) => s.is_primary)) flags.add('unverified-popular')

  const text = (check.verdict === 'partly' && check.rewrite?.trim() ? check.rewrite : p.claim.text).trim().replace(/\s+/g, ' ').slice(0, 500)
  const norm = normalizeText(text)
  const notes = [
    `LLM check: ${check.verdict}. ${check.core}`,
    ...(check.embellishment ? [`Not supported by the sources: ${check.embellishment}`] : []),
    ...(text !== p.claim.text ? [`Reworded from the proposal: "${clip(p.claim.text, 200)}"`] : []),
    `${lineages} independent lineage${lineages === 1 ? '' : 's'} among ${sources.length} cited page${sources.length === 1 ? '' : 's'}${sources.some((s) => s.read === 'snippet') ? ` (${sources.filter((s) => s.read === 'snippet').length} read from the search snippet only)` : ''}.`,
    ...check.notes,
  ]
  return {
    kept: {
      text,
      text_norm: norm,
      claim_hash: sha256(norm),
      original_text: p.claim.text,
      kind: p.claim.kind,
      subject: p.claim.subject.trim(),
      theme: p.claim.theme,
      region: p.claim.region,
      era: eraOf(p.claim.year_from),
      entities: p.claim.entities.map((e) => ({ name: e.name.trim(), kind: e.kind })).filter((e) => e.name),
      year_from: p.claim.year_from,
      year_to: p.claim.year_to,
      place: p.claim.place,
      country_code: p.claim.country_code?.toUpperCase() ?? null,
      is_quotation: p.claim.is_quotation,
      is_hearsay: check.is_hearsay,
      is_anonymous: check.is_anonymous,
      speaker: check.speaker,
      sensitive: p.claim.sensitive,
      grade,
      score: GRADE_SCORE[grade],
      flags: [...flags],
      verdict: check.verdict,
      core: check.core,
      embellishment: check.embellishment,
      why_curious: p.claim.why_curious,
      notes,
      evidence: pick.i,
      sources,
      checkModel: modelUsed,
    },
  }
}

/** Research, propose and check. Pure of the database: the caller writes `kept`. */
export async function runLlmDesk(brief: LlmBrief, deps: RunDeps): Promise<LlmRunResult> {
  const count = Math.min(LLM_RULES.maxCount, Math.max(1, Math.round(brief.count)))
  const b = { ...brief, count }
  const models = { research: deps.models?.research ?? DEFAULT_RESEARCH_MODEL, propose: deps.models?.propose ?? DEFAULT_PROPOSE_MODEL, check: deps.models?.check ?? DEFAULT_CHECK_MODEL }
  const log = deps.log ?? (() => {})

  log(`research: ${describeBrief(b).replace(/\n/g, ' · ')}`)
  const research = await deps.research({ system: RESEARCH_SYSTEM, prompt: researchPrompt(b, deps.avoid ?? []), model: models.research })
  log(`  ${research.queries.length} searches, ${research.results.length} results`)
  if (!research.results.length) return { brief: b, queries: research.queries, results: 0, proposed: 0, kept: [], dropped: [{ text: '(research)', reason: 'the web search returned no results' }] }

  const { result: proposal, modelUsed: proposeModel } = await deps.generate({
    system: PROPOSE_SYSTEM,
    prompt: proposePrompt(b, research.text, research.results),
    schema: ProposalSchema,
    model: models.propose,
    metadata: { feature: 'curious-llm-propose' },
  })
  const dropped: Dropped[] = []
  const known = deps.knownHashes ?? new Set<string>()
  const fresh = proposal.claims.filter((c) => {
    if (known.has(sha256(normalizeText(c.text.trim().replace(/\s+/g, ' '))))) {
      dropped.push({ text: c.text, reason: 'already on the desk' })
      return false
    }
    return true
  })
  const resolved = resolveCitations(fresh, research.results)
  for (const c of fresh) if (!resolved.some((r) => r.claim === c)) dropped.push({ text: c.text, reason: 'cited no search result that supports it' })
  const toCheck = resolved.slice(0, count)
  log(`propose: ${proposal.claims.length} claims, ${toCheck.length} to check`)

  const pages = new Map<string, Promise<PageText | null>>()
  const checked = await mapPool(toCheck, deps.concurrency ?? 3, async (p) => {
    try {
      return await checkOne(p, { generate: deps.generate, readPage: deps.readPage, log, model: models.check, pages })
    } catch (e) {
      return { dropped: { text: p.claim.text, reason: `check failed: ${e instanceof Error ? e.message : String(e)}` } }
    }
  })
  const kept: CheckedClaim[] = []
  const hashes = new Set<string>()
  for (const r of checked) {
    if ('dropped' in r) {
      dropped.push(r.dropped)
      continue
    }
    const { checkModel, ...k } = r.kept
    if (hashes.has(k.claim_hash) || known.has(k.claim_hash)) {
      dropped.push({ text: k.text, reason: 'already on the desk' })
      continue
    }
    hashes.add(k.claim_hash)
    kept.push({ ...k, models: { research: research.modelUsed, propose: proposeModel, check: checkModel } })
    log(`  ${k.grade} ${k.verdict.padEnd(12)} ${clip(k.text, 90)}`)
  }
  for (const d of dropped) log(`  ✗ ${clip(d.text, 70)} — ${d.reason}`)
  return { brief: b, queries: research.queries, results: research.results.length, proposed: proposal.claims.length, kept, dropped }
}

/** The external id of a web-search document: a short hash of its canonical URL. */
export const webSearchExternalId = (canonical: string): string => sha1(canonical).slice(0, 24)

/** The default deps: the AI Gateway for both model calls, the robots-honouring page reader. Server only. */
export async function defaultDeps(opts: { log?: (s: string) => void } = {}): Promise<Pick<RunDeps, 'research' | 'generate' | 'readPage'>> {
  const [{ researchWithWebSearch }, { generateText }, { fetchArticleText }] = await Promise.all([import('@vismay/ai-gateway/search'), import('@vismay/ai-gateway/text'), import('./fetchText')])
  const limiters = new Map()
  const robots = new Map<string, string | null>()
  return {
    research: async (o) => researchWithWebSearch({ ...o, maxSteps: 14, metadata: { feature: 'curious-llm-research' } }),
    generate: async (o) => {
      const res = await generateText({ model: o.model, system: o.system, prompt: o.prompt, schema: o.schema, temperature: 0, metadata: o.metadata })
      return { result: res.result as z.infer<typeof o.schema>, modelUsed: res.modelUsed }
    },
    readPage: async (url) => {
      try {
        const a = await fetchArticleText(url, { limiters, robots, log: opts.log })
        return a ? { text: a.text, title: a.title, author: a.author, publishedAt: a.publishedAt } : null
      } catch {
        return null
      }
    },
  }
}
