/**
 * Contradictions within a lexical cluster: two versions of one claim whose
 * numbers or years disagree, or where one negates what the other asserts.
 * Found claims are linked both ways and flagged; the brief then tells the
 * agent the record is contested instead of letting one version win.
 */

import { normalizeText, tokens } from './text'

export const CONTRADICT_RULES = {
  /** Relative difference above which two figures disagree. */
  numberTolerance: 0.1,
} as const

export interface ContradictInput {
  id: string
  text: string
}

export interface Contradiction {
  a: string
  b: string
  reason: 'number' | 'year' | 'negation'
  detail: string
}

const NEG = /\b(not|never|no|none|nobody|neither|nor|without|didn't|wasn't|weren't|isn't|aren't|cannot|can't|couldn't|wouldn't|failed to)\b/

function figures(text: string): { years: number[]; numbers: number[] } {
  const years: number[] = []
  const numbers: number[] = []
  for (const t of tokens(text)) {
    if (t.startsWith('y:')) years.push(Number(t.slice(2)))
    else if (t.startsWith('n:') || t.startsWith('pct:')) numbers.push(Number(t.split(':')[1]))
  }
  return { years: years.sort(), numbers: numbers.sort((x, y) => x - y) }
}

const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), 1)

/** Whether two claims that say the same thing disagree on a figure, a year or a negation. */
export function contradicts(a: ContradictInput, b: ContradictInput): Contradiction | null {
  const fa = figures(a.text)
  const fb = figures(b.text)
  if (fa.years.length && fb.years.length && !fa.years.some((y) => fb.years.includes(y))) {
    return { a: a.id, b: b.id, reason: 'year', detail: `${fa.years.join('/')} vs ${fb.years.join('/')}` }
  }
  if (fa.numbers.length && fb.numbers.length) {
    const matched = fa.numbers.some((x) => fb.numbers.some((y) => near(x, y, CONTRADICT_RULES.numberTolerance)))
    if (!matched) return { a: a.id, b: b.id, reason: 'number', detail: `${fa.numbers.join('/')} vs ${fb.numbers.join('/')}` }
  }
  const na = NEG.test(normalizeText(a.text))
  const nb = NEG.test(normalizeText(b.text))
  if (na !== nb) return { a: a.id, b: b.id, reason: 'negation', detail: na ? `"${a.text.slice(0, 60)}" negates` : `"${b.text.slice(0, 60)}" negates` }
  return null
}

/** Every contradicting pair within one cluster. */
export function findContradictions(cluster: ContradictInput[]): Contradiction[] {
  const out: Contradiction[] = []
  for (let i = 0; i < cluster.length; i++) for (let j = i + 1; j < cluster.length; j++) {
    const c = contradicts(cluster[i], cluster[j])
    if (c) out.push(c)
  }
  return out
}
