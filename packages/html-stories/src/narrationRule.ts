/**
 * The bits of the narration rule (./narration) that the serving side needs
 * too, without cheerio: the section selectors the player resolves in the
 * browser, the document hash a manifest is checked against, and the
 * narration script's shape and hash.
 */

import { createHash } from 'node:crypto'

/** The selectors tried in order; the first that matches anything wins. */
export const NARRATION_SECTION_SELECTORS = ['[data-unit]', '[data-step]', 'section'] as const

/** sha256 of a whole document: what a manifest was generated from. */
export function htmlHash(html: string): string {
  return createHash('sha256').update(html).digest('hex')
}

/**
 * One section's line in a story's narration script (html_story_scripts,
 * migration 108): what the voice reads for the section at `index` instead of
 * its on-screen text. `label` is the section's label when the line was
 * written, so the editor can flag a script that no longer lines up with the
 * page; it isn't read aloud.
 */
export interface NarrationScriptEntry {
  index: number
  label: string
  text: string
}

/** Longest line one section's script may hold. */
export const MAX_SCRIPT_CHARS = 20_000

/**
 * A script as stored: one entry per section index, trimmed, empty lines
 * dropped (an empty line means "read the page"), in index order. Anything
 * malformed is left out rather than refused.
 */
export function normalizeNarrationScript(input: unknown): NarrationScriptEntry[] {
  if (!Array.isArray(input)) return []
  const byIndex = new Map<number, NarrationScriptEntry>()
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const index = Number(r.index)
    if (!Number.isInteger(index) || index < 0 || index > 10_000) continue
    const text = typeof r.text === 'string' ? r.text.replace(/\r\n?/g, '\n').trim().slice(0, MAX_SCRIPT_CHARS) : ''
    if (!text) continue
    const label = typeof r.label === 'string' ? r.label.trim().slice(0, 80) : ''
    byIndex.set(index, { index, label, text })
  }
  return [...byIndex.values()].sort((a, b) => a.index - b.index)
}

/**
 * sha256 of what a script has the voice read (indices and text, not labels),
 * or null for no script: what a manifest records it was made from, so the
 * editor knows when the audio is behind the script.
 */
export function narrationScriptHash(script: NarrationScriptEntry[]): string | null {
  const lines = normalizeNarrationScript(script)
  if (!lines.length) return null
  return createHash('sha256')
    .update(JSON.stringify(lines.map((l) => [l.index, l.text])))
    .digest('hex')
}
