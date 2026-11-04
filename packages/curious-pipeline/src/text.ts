/**
 * Text utilities every stage shares: normalisation and hashing (the
 * content_hash and claim_hash columns), canonical URLs (one key for a story
 * that arrives with tracking parameters), sentence splitting, and an
 * IDF-weighted token cosine for the lexical clustering in dedupe.ts. The
 * tokenizer follows eventTokens in packages/dc-editions/src/dcEditionAssembly.ts:
 * numbers and years become canonical tokens so "60.9 million" matches
 * "60,900,000" and "1982" is a strong, rare token.
 */

import { createHash } from 'node:crypto'

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex')
export const sha1 = (s: string): string => createHash('sha1').update(s).digest('hex')

/** Lowercase, ASCII-fold, collapse whitespace and punctuation: the key for hashes. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/[^a-z0-9%$€£.'"\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const TRACKING = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|igshid$|ref$|ref_src$|cmpid$|ncid$|ocid$|spm$|_ga$)/i

/**
 * One URL per story: https, no www./amp./m. host prefix, no tracking
 * parameters, no fragment, no trailing slash, sorted query. Returns the
 * input when it does not parse.
 */
export function canonicalUrl(raw: string): string {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return raw.trim()
  }
  if (u.protocol === 'http:') u.protocol = 'https:'
  u.hostname = u.hostname.toLowerCase().replace(/^(www\d?|amp|m|mobile)\./, '')
  u.hash = ''
  const keep = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b))
  u.search = ''
  for (const [k, v] of keep) u.searchParams.append(k, v)
  u.pathname = u.pathname.replace(/\/amp\/?$/, '/').replace(/\/+$/, '') || '/'
  const out = u.toString()
  return u.pathname === '/' && !u.search ? out.replace(/\/$/, '') : out
}

/** The registrable-ish domain: the last two labels, three for the usual second-level TLDs. */
export function domainOf(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\d?\./, '')
    const parts = host.split('.')
    if (parts.length <= 2) return host
    const sld = parts[parts.length - 2]
    if (/^(co|com|org|net|ac|gov|edu|or|ne)$/.test(sld) && parts[parts.length - 1].length === 2) return parts.slice(-3).join('.')
    return parts.slice(-2).join('.')
  } catch {
    return ''
  }
}

const ABBREV = /\b(Mr|Mrs|Ms|Dr|Prof|St|Sr|Jr|No|vs|etc|Inc|Ltd|Co|Gen|Col|Capt|Lt|Sgt|Fig|approx|c|ca|e\.g|i\.e|U\.S|U\.K|U\.N)\.$/

/** Sentences with their offsets in the input. Keeps abbreviations and decimals together. */
export function sentenceSplit(text: string): Array<{ text: string; start: number; end: number }> {
  const out: Array<{ text: string; start: number; end: number }> = []
  const re = /[^.!?\n]+(?:[.!?]+["”’)]?|\n+|$)/g
  let m: RegExpExecArray | null
  let pending: { start: number; end: number } | null = null
  while ((m = re.exec(text))) {
    if (!m[0].trim()) continue
    const start: number = pending ? pending.start : m.index
    const end: number = m.index + m[0].length
    const slice = text.slice(start, end)
    const trimmedEnd = slice.replace(/\s+$/, '')
    const nextChar = text.slice(end, end + 40).trimStart()[0] ?? ''
    const endsAbbrev = ABBREV.test(trimmedEnd) || /\b\d+\.$/.test(trimmedEnd) || (/\.$/.test(trimmedEnd) && /^[a-z]/.test(nextChar))
    if (endsAbbrev && end < text.length) {
      pending = { start, end }
      continue
    }
    pending = null
    const s = text.slice(start, end)
    const lead = s.length - s.trimStart().length
    const trail = s.length - s.trimEnd().length
    if (s.trim()) out.push({ text: s.trim(), start: start + lead, end: end - trail })
  }
  if (pending) {
    const s = text.slice(pending.start)
    if (s.trim()) out.push({ text: s.trim(), start: pending.start, end: text.length })
  }
  return out
}

const STOP = new Set(
  'a an the and or but of in on at to for from by with as is was were are be been being it its this that these those he she they them his her their we our you your i me my not no than then so if into over under about after before between during through while also more most such which who whom whose what when where why how one two first last only said says say according reportedly has have had do does did will would can could may might shall should'.split(
    ' ',
  ),
)

const stem = (w: string): string => (w.length > 5 ? w.replace(/(ings?|edly|ed|ly|es|s)$/, '') : w.replace(/s$/, ''))

const SCALE: Record<string, number> = { thousand: 1e3, k: 1e3, million: 1e6, mn: 1e6, m: 1e6, mln: 1e6, billion: 1e9, bn: 1e9, b: 1e9, trillion: 1e12, tn: 1e12 }

/** Tokens that identify a claim: words stemmed, years as y:1982, numbers canonicalised to 2 significant figures. */
export function tokens(text: string | null | undefined): Set<string> {
  let t = normalizeText(text ?? '')
  t = t.replace(/\b(1[5-9]\d\d|20[0-2]\d)s?\b/g, (_m, y: string) => ` y:${y} `)
  t = t.replace(/(?<![:\d.])(\d[\d]*(?:\.\d+)?)\s*(thousand|million|billion|trillion|mln|mn|bn|tn|[kmb])\b/g, (_m, n: string, s: string) => ` n:${sig(Number(n) * SCALE[s])} `)
  t = t.replace(/(?<![:\d.])(\d[\d]*(?:\.\d+)?)\s*(%|percent|per cent)/g, (_m, n: string) => ` pct:${sig(Number(n))} `)
  t = t.replace(/(?<![:\d.])(\d[\d]*(?:\.\d+)?)\b/g, (_m, n: string) => ` n:${sig(Number(n))} `)
  const out = new Set<string>()
  for (const raw of t.split(/[^a-z0-9:.]+/)) {
    const tok = raw.replace(/^[.:]+|[.:]+$/g, '')
    if (!tok || STOP.has(tok)) continue
    if (tok.includes(':')) {
      out.add(tok)
      continue
    }
    const st = stem(tok)
    if (st.length < 3) continue
    out.add(st)
  }
  return out
}

const sig = (n: number): string => (Number.isFinite(n) ? Number(n.toPrecision(2)).toString() : 'nan')

export interface Idf {
  n: number
  df: Map<string, number>
}

export function buildIdf(docs: Iterable<Set<string>>): Idf {
  const df = new Map<string, number>()
  let n = 0
  for (const d of docs) {
    n++
    for (const t of d) df.set(t, (df.get(t) ?? 0) + 1)
  }
  return { n, df }
}

export const idfWeight = (idf: Idf, t: string): number => Math.log(1 + idf.n / (1 + (idf.df.get(t) ?? 0)))

/** IDF-weighted cosine between two token sets; 0 when either is empty. */
export function cosine(a: Set<string>, b: Set<string>, idf: Idf): number {
  if (!a.size || !b.size) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (const t of a) {
    const w = idfWeight(idf, t)
    na += w * w
    if (b.has(t)) dot += w * w
  }
  for (const t of b) {
    const w = idfWeight(idf, t)
    nb += w * w
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

/** Sentences of at least `minWords` words that two texts share verbatim (normalised): the copy-lineage signal. */
export function sharedSentences(a: string, b: string, minWords = 12): string[] {
  const norm = (s: string) => normalizeText(s)
  const setB = new Set(sentenceSplit(b).map((s) => norm(s.text)).filter((s) => s.split(' ').length >= minWords))
  const out: string[] = []
  for (const s of sentenceSplit(a)) {
    const n = norm(s.text)
    if (n.split(' ').length >= minWords && setB.has(n)) out.push(n)
  }
  return out
}

/** Clip to at most `max` characters on a word boundary, with an ellipsis when cut. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max - 1)
  const at = cut.lastIndexOf(' ')
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`
}

/** Parse a date string the sources use into an ISO timestamp and its precision. */
export function parseDate(raw: string | null | undefined): { iso: string | null; precision: 'minute' | 'day' | 'month' | 'year' | 'unknown' } {
  const s = (raw ?? '').trim()
  if (!s) return { iso: null, precision: 'unknown' }
  let m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s)
  if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`, precision: 'minute' }
  m = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}/.exec(s)
  if (m && !Number.isNaN(Date.parse(s))) return { iso: new Date(s).toISOString(), precision: 'minute' }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}T00:00:00Z`, precision: 'day' }
  m = /^(\d{4})-(\d{2})$/.exec(s)
  if (m) return { iso: `${m[1]}-${m[2]}-01T00:00:00Z`, precision: 'month' }
  m = /^\[?c?a?\.?\s?(\d{4})\]?\??$/.exec(s)
  if (m) return { iso: `${m[1]}-01-01T00:00:00Z`, precision: 'year' }
  m = /(\d{4})/.exec(s)
  if (m) return { iso: `${m[1]}-01-01T00:00:00Z`, precision: 'year' }
  return { iso: null, precision: 'unknown' }
}

export const yearOf = (iso: string | null | undefined): number | null => (iso ? Number(iso.slice(0, 4)) : null)
