/**
 * Atomic-claim extraction: a schema-constrained model pass over a candidate
 * passage. The model is asked for self-contained claims each with a
 * verbatim evidence quote; a claim whose quote cannot be found in the
 * passage is dropped, because provenance comes first. The generate function
 * is injectable, so the tests use a fake and the CLI uses
 * `@vismay/ai-gateway`'s generateText with a Zod schema.
 */

import { z } from 'zod'
import type { Candidate } from './detect'
import { eraOf, REGION_IDS, THEME_IDS } from './taxonomy'
import { normalizeText, sha256 } from './text'
import type { ClaimKind, EntityKind } from './types'

export const EXTRACT_VERSION = 'curious-extract-v1-2026-11'
export const DEFAULT_EXTRACT_MODEL = 'text.haiku'

export const AtomicClaimSchema = z.object({
  text: z.string().max(400).describe('One atomic, self-contained claim in plain past-tense English. No "this", no "the film": name the thing.'),
  kind: z.enum(['fact', 'anecdote', 'number', 'quote']).describe('fact: a checkable statement; anecdote: a story about people; number: the claim is a figure; quote: words attributed to someone.'),
  subject: z.string().max(120).describe('Who or what the claim is about.'),
  theme: z.enum(THEME_IDS).describe('The closest theme.'),
  region: z.enum(REGION_IDS).describe('Where it happened; world when global or unknown.'),
  entities: z
    .array(z.object({ name: z.string().max(120), kind: z.enum(['person', 'org', 'place', 'work', 'event', 'other']) }))
    .max(8)
    .describe('Named people, organisations, places, works (films, books, songs) and events in the claim.'),
  year_from: z.number().int().nullable().describe('The year the claim is about (negative for BCE), or null.'),
  year_to: z.number().int().nullable().describe('The end year when the claim spans years, else null.'),
  place: z.string().max(120).nullable(),
  country_code: z.string().length(2).nullable().describe('ISO 3166-1 alpha-2 of the modern country, or null.'),
  evidence_quote: z.string().max(300).describe('A verbatim span of the passage, at most 300 characters, that states the claim. Copy it exactly.'),
  attribution: z.object({
    speaker: z.string().max(120).nullable().describe('Who the passage attributes the claim to, if anyone.'),
    is_anonymous: z.boolean().describe('True when the passage gives no named source for the claim.'),
    is_hearsay: z.boolean().describe('True for "reportedly", "it is said", "legend has it" and the like.'),
  }),
  is_quotation: z.boolean().describe('True when the claim is that someone said these words.'),
  sensitive: z.boolean().describe('True when the claim concerns crime, health, minors, sexuality or a private person.'),
  confidence: z.number().min(0).max(1).describe('How clearly the passage states the claim, not whether it is true.'),
})
export type AtomicClaim = z.infer<typeof AtomicClaimSchema>

export const AtomicClaimsSchema = z.object({ claims: z.array(AtomicClaimSchema).max(6) })

export const EXTRACT_SYSTEM = `You split a passage into atomic claims for a fact-checking desk. Rules:
- One claim per distinct checkable proposition. Split compound sentences. "X was popular and the KGB used it" is two claims.
- Each claim must be self-contained: name the people, works and places; no pronouns, no "the film".
- evidence_quote is copied verbatim from the passage (at most 300 characters). Never paraphrase it. If no span states the claim, leave the claim out.
- Keep the passage's hedges in your reading: "reportedly", "it is said", "legend has it" make is_hearsay true. A claim with no named source is is_anonymous.
- Prefer the surprising, specific, datable: firsts, lasts, onlys, numbers, twists, who-did-what-when. Skip opinion, generic background and anything you cannot quote.
- Return at most 6 claims; fewer is fine; an empty list is fine.`

export interface Generate {
  <S extends z.ZodType>(o: { system: string; prompt: string; schema: S; model?: string; metadata?: Record<string, string> }): Promise<{ result: z.infer<S>; modelUsed: string }>
}

/** The default: @vismay/ai-gateway, loaded lazily so the pure modules import without the SDK. */
export const gatewayGenerate: Generate = async (o) => {
  const { generateText } = await import('@vismay/ai-gateway/text')
  const res = await generateText({ model: o.model ?? DEFAULT_EXTRACT_MODEL, system: o.system, prompt: o.prompt, schema: o.schema, temperature: 0, metadata: o.metadata })
  return { result: res.result as z.infer<typeof o.schema>, modelUsed: res.modelUsed }
}

export interface DocumentMeta {
  source_id: string
  title: string | null
  publisher: string | null
  published_at: string | null
  language: string | null
}

export interface ExtractedClaim {
  text: string
  text_norm: string
  claim_hash: string
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
  evidence_quote: string
  /** Offsets into the document text (the candidate's start plus the quote's position in the passage). */
  evidence_start: number
  evidence_end: number
  attribution: AtomicClaim['attribution']
  is_quotation: boolean
  sensitive: boolean
  confidence: number
  extractor_model: string
}

/** Where a quote sits in the passage: exact first, then whitespace- and quote-mark-insensitive. */
export function locateQuote(passage: string, quote: string): { start: number; end: number; exact: string } | null {
  const q = quote.trim()
  if (!q) return null
  const i = passage.indexOf(q)
  if (i >= 0) return { start: i, end: i + q.length, exact: q }
  const words = q.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/["'’‘“”]/g, '["\'’‘“”]'))
  if (!words.length) return null
  const re = new RegExp(words.join('\\s+'), 'i')
  const m = re.exec(passage)
  if (!m) return null
  return { start: m.index, end: m.index + m[0].length, exact: m[0] }
}

export function extractPrompt(candidate: Candidate, doc: DocumentMeta): string {
  const head = [doc.title ? `Title: ${doc.title}` : null, doc.publisher ? `Publisher: ${doc.publisher}` : null, doc.published_at ? `Published: ${doc.published_at.slice(0, 10)}` : null, `Source: ${doc.source_id}`, doc.language ? `Language: ${doc.language}` : null]
    .filter(Boolean)
    .join('\n')
  return `${head}\n\nPassage:\n"""\n${candidate.passage}\n"""`
}

/** Claims from one passage; quotes not found in the passage are dropped. */
export async function extractClaims(candidate: Candidate, doc: DocumentMeta, opts: { generate?: Generate; model?: string } = {}): Promise<ExtractedClaim[]> {
  const generate = opts.generate ?? gatewayGenerate
  const { result, modelUsed } = await generate({
    system: EXTRACT_SYSTEM,
    prompt: extractPrompt(candidate, doc),
    schema: AtomicClaimsSchema,
    model: opts.model ?? DEFAULT_EXTRACT_MODEL,
    metadata: { feature: 'curious-extract', source: doc.source_id },
  })
  const out: ExtractedClaim[] = []
  const seen = new Set<string>()
  for (const c of result.claims) {
    const loc = locateQuote(candidate.passage, c.evidence_quote)
    if (!loc) continue
    const text = c.text.trim().replace(/\s+/g, ' ')
    if (text.length < 12) continue
    const norm = normalizeText(text)
    const hash = sha256(norm)
    if (seen.has(hash)) continue
    seen.add(hash)
    out.push({
      text,
      text_norm: norm,
      claim_hash: hash,
      kind: c.kind,
      subject: c.subject.trim(),
      theme: c.theme,
      region: c.region,
      era: eraOf(c.year_from),
      entities: c.entities.map((e) => ({ name: e.name.trim(), kind: e.kind })).filter((e) => e.name),
      year_from: c.year_from,
      year_to: c.year_to,
      place: c.place?.trim() || null,
      country_code: c.country_code?.toUpperCase() ?? null,
      evidence_quote: loc.exact.slice(0, 300),
      evidence_start: candidate.start + loc.start,
      evidence_end: candidate.start + Math.min(loc.end, loc.start + 300),
      attribution: c.attribution,
      is_quotation: c.is_quotation,
      sensitive: c.sensitive,
      confidence: c.confidence,
      extractor_model: modelUsed,
    })
  }
  return out
}
