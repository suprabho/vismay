/**
 * Manual-paste adapter. Used when the source is a PDF press release, a paywalled
 * article, or any text the admin curates by hand. Same Gemini extractor under
 * the hood as the press-release adapter — only the input plumbing differs.
 */

import { RawSquadEntry } from '../types';
import { extractSquadFromText } from './gemini-extract';

export async function extractSquadFromManualText(text: string): Promise<RawSquadEntry[]> {
  if (!text || text.trim().length < 50) {
    throw new Error('Manual text too short — paste at least the squad list');
  }
  return extractSquadFromText(text);
}
