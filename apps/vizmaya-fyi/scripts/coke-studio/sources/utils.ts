/**
 * Shared helpers for lyric source modules: title/artist normalisation, fuzzy
 * matching, script detection, polite HTTP fetch.
 */

import type { LyricsCandidate } from './types.js'

export const USER_AGENT =
  'vizmaya-coke-studio-fetcher/1.0 (+https://vizmaya.fyi; contact: hello@promad.design)'

export function normaliseForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Score a hit's title + primary artist against the source song. Higher = better. */
export function matchScore(opts: {
  songTitle: string
  songArtists: string | null
  hitTitle: string
  hitArtist: string
  cokeStudioBonusHaystack?: string
}): number {
  const titleTokens = new Set(normaliseForMatch(opts.songTitle).split(' ').filter(Boolean))
  const artistTokens = new Set(
    (opts.songArtists ?? '')
      .split(/[|,&]/)
      .flatMap((a) => normaliseForMatch(a).split(' '))
      .filter(Boolean),
  )
  const hitTitleTokens = new Set(normaliseForMatch(opts.hitTitle).split(' ').filter(Boolean))
  const hitArtistTokens = new Set(normaliseForMatch(opts.hitArtist).split(' ').filter(Boolean))
  const titleOverlap = [...titleTokens].filter((t) => hitTitleTokens.has(t)).length
  const artistOverlap = [...artistTokens].filter((t) => hitArtistTokens.has(t)).length
  const haystack = opts.cokeStudioBonusHaystack ?? `${opts.hitTitle} ${opts.hitArtist}`
  const cokeBonus = /coke[\s_-]*studio/i.test(haystack) ? 5 : 0
  return titleOverlap * 2 + artistOverlap + cokeBonus
}

export interface ScriptDetect {
  has_native_script: boolean
  has_translation: boolean
  script_hint: 'arabic' | 'latin' | 'devanagari' | 'mixed' | null
}

/** Inspect the first ~600 chars of a text to classify script + bilingual-ness. */
export function detectScript(text: string): ScriptDetect {
  const sample = text.slice(0, 600)
  let arabic = 0
  let latin = 0
  let devanagari = 0
  for (const ch of sample) {
    const cp = ch.codePointAt(0) ?? 0
    if ((cp >= 0x0600 && cp <= 0x06ff) || (cp >= 0x0750 && cp <= 0x077f)) arabic++
    else if (cp >= 0x0900 && cp <= 0x097f) devanagari++
    else if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) latin++
  }
  const total = arabic + latin + devanagari
  if (total === 0) return { has_native_script: false, has_translation: false, script_hint: null }
  const dominant = Math.max(arabic, latin, devanagari)
  const isMixed = dominant / total < 0.7
  // "Has translation" is approximated as: the text contains both a
  // non-Latin script AND a meaningful chunk of Latin (likely English
  // translation or Roman transliteration alongside the native script).
  // English-only songs also count as has_translation=true (the LLM
  // extractor doesn't need a translation pass).
  const hasNativeChunk = arabic + devanagari > 30
  const hasLatinChunk = latin > 30
  const has_translation = hasNativeChunk ? hasLatinChunk : hasLatinChunk
  const has_native_script = hasNativeChunk
  const script_hint: ScriptDetect['script_hint'] = isMixed
    ? 'mixed'
    : dominant === arabic
      ? 'arabic'
      : dominant === devanagari
        ? 'devanagari'
        : 'latin'
  return { has_native_script, has_translation, script_hint }
}

/** Quality score for picking between candidates from different sources. */
export function scoreCandidate(c: LyricsCandidate): number {
  return (
    c.raw_text.length +
    (c.has_native_script ? 1000 : 0) +
    (c.has_translation ? 1000 : 0)
  )
}

export function pickBest(candidates: LyricsCandidate[]): LyricsCandidate | null {
  if (candidates.length === 0) return null
  return [...candidates].sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0]
}

/** fetch with a User-Agent header and a structured error message. */
export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: { 'user-agent': USER_AGENT, ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    throw new Error(`fetch ${res.status} ${res.statusText}: ${url}`)
  }
  return res.text()
}
