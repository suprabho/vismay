/**
 * The bits of the narration rule (./narration) that the serving side needs
 * too, without cheerio: the section selectors the player resolves in the
 * browser, and the document hash a manifest is checked against.
 */

import { createHash } from 'node:crypto'

/** The selectors tried in order; the first that matches anything wins. */
export const NARRATION_SECTION_SELECTORS = ['[data-unit]', '[data-step]', 'section'] as const

/** sha256 of a whole document: what a manifest was generated from. */
export function htmlHash(html: string): string {
  return createHash('sha256').update(html).digest('hex')
}
