/**
 * Candidate detection, high recall and cheap: regex rules over sentences,
 * passages built around the hits, ranked by rule weight and capped per
 * document so the model pass that follows sees at most a few passages. A
 * hit here makes a *candidate*, never a fact.
 */

import { sentenceSplit } from './text'

export const DETECT_VERSION = 'curious-detect-v1-2026-11'

export interface DetectRule {
  id: string
  re: RegExp
  weight: number
}

export const DETECT_RULES: readonly DetectRule[] = [
  { id: 'first-last-only', re: /\b(?:the\s+)?(?:first|last|only|oldest|youngest|largest|smallest|earliest|final)\b[^.!?]{0,80}\b(?:ever|in history|on record|of (?:its|his|her|their) kind|in the world|known)\b|\bfor the first time\b|\bthe only (?:man|woman|person|one|country|city|time)\b|\blast survivor\b/i, weight: 3 },
  { id: 'hearsay', re: /\b(?:reportedly|allegedly|supposedly|according to|is said to|it is said|legend has it|according to legend|it is (?:believed|claimed|rumou?red)|so the story goes|recalled|remembered)\b/i, weight: 2 },
  { id: 'years-later', re: /\b(?:\d{1,3}|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|a hundred|decades|years|centuries|generations)\s+(?:years?\s+|decades?\s+|centuries\s+)?later\b|\bnot until\b|\buntil (?:1[5-9]\d\d|20[0-2]\d)\b/i, weight: 2 },
  { id: 'twist', re: /\b(?:accidentally|by accident|by mistake|mistook|mistaken for|refused|escaped|smuggled|banned|forbidden|forgotten|rediscovered|lost for|disguised as|secretly|in secret|hoax|never happened|turned out)\b/i, weight: 2 },
  { id: 'number-unit', re: /\b\d[\d,.]*\s?(?:million|billion|thousand|per\s?cent|%|km|kilomet(?:re|er)s?|miles?|tons?|tonnes?|hours?|days?|years?|copies|admissions|viewers|people|men|women|soldiers|ships|roubles|rubles|rupees|dollars|francs|pounds)\b/i, weight: 1 },
  { id: 'dated', re: /\b(?:in|since|by|on|during)\s+(?:the\s+)?(?:1[5-9]\d\d|20[0-2]\d)\b|\b(?:1[5-9]|20)\d\ds\b/i, weight: 1 },
  { id: 'record', re: /\b(?:world record|record(?:-| )breaking|unprecedented|never before|never again|the most \w+ (?:ever|in history))\b/i, weight: 2 },
  { id: 'quote', re: /["“][^"”]{20,200}["”]\s*(?:,|—|-)?\s*(?:he|she|they|\w+)\s+(?:said|wrote|told|recalled)|\b(?:said|wrote|told|recalled)\s*[:,]?\s*["“]/i, weight: 1 },
]

export interface Candidate {
  /** Offsets into the document text. */
  start: number
  end: number
  passage: string
  rules: string[]
  score: number
}

export interface DetectOptions {
  maxPassages?: number
  /** Passage size in characters; sentences are added around a hit until this is reached. */
  window?: number
  /** Below this score a passage is not a candidate. */
  minScore?: number
  rules?: readonly DetectRule[]
}

export function rulesHit(sentence: string, rules: readonly DetectRule[] = DETECT_RULES): DetectRule[] {
  return rules.filter((r) => r.re.test(sentence))
}

/**
 * Passages worth a model pass. The sentences are cut into consecutive
 * chunks of at most `window` characters (a single longer sentence stands
 * alone); each chunk scores the sum of the weights of the distinct rules its
 * sentences fire; the top `maxPassages` chunks at or above `minScore` come
 * back in document order with their offsets.
 */
export function detectCandidates(text: string, opts: DetectOptions = {}): Candidate[] {
  const maxPassages = opts.maxPassages ?? 3
  const window = opts.window ?? 1200
  const minScore = opts.minScore ?? 2
  const rules = opts.rules ?? DETECT_RULES
  const sents = sentenceSplit(text)
  if (!sents.length) return []
  type Chunk = { from: number; to: number; size: number }
  const chunks: Chunk[] = []
  let cur: Chunk | null = null
  for (let i = 0; i < sents.length; i++) {
    const len = sents[i].end - (cur ? sents[cur.from].start : sents[i].start)
    if (cur && len <= window) {
      cur.to = i
      cur.size = len
    } else {
      cur = { from: i, to: i, size: sents[i].text.length }
      chunks.push(cur)
    }
  }
  const scored = chunks.map((c) => {
    const ids = new Set<string>()
    for (let j = c.from; j <= c.to; j++) for (const r of rulesHit(sents[j].text, rules)) ids.add(r.id)
    const score = [...ids].reduce((acc, id) => acc + (rules.find((r) => r.id === id)?.weight ?? 0), 0)
    return { ...c, rules: [...ids].sort(), score }
  })
  return scored
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score || a.from - b.from)
    .slice(0, maxPassages)
    .sort((a, b) => a.from - b.from)
    .map((c) => {
      const start = sents[c.from].start
      const end = sents[c.to].end
      return { start, end, passage: text.slice(start, end), rules: c.rules, score: c.score }
    })
}
