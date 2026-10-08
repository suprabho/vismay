/**
 * LLM-backed squad extractor. Shared by the press-release and manual
 * adapters: both feed raw text in and get RawSquadEntry[] out.
 *
 * Mirrors the structured-output pattern in ../../summarize.ts — Claude Haiku
 * via the AI Gateway (`text.haiku`, overridable with TEXT_MODEL), low
 * temperature, a hard zod schema. The instruction is squad-specific (extract
 * every player, normalize positions, keep clubs as written).
 */

import { generateText } from '@vismay/ai-gateway';
import { z } from 'zod';
import { RawSquadEntry } from '../types';

const TEXT_MODEL = process.env.TEXT_MODEL || 'text.haiku';

const SquadSchema = z.object({
  players: z.array(
    z.object({
      name: z.string().describe('Full player name as written in the source.'),
      position: z
        .enum(['GK', 'DF', 'MF', 'FW'])
        .optional()
        .describe('Goalkeeper, Defender, Midfielder, or Forward. Best guess from any position label or section header.'),
      jersey: z.number().int().optional().describe('Jersey number if given. Omit otherwise.'),
      date_of_birth: z.string().optional().describe('ISO YYYY-MM-DD if a date appears. Omit otherwise.'),
      club_name: z
        .string()
        .optional()
        .describe('Club at call-up time, exactly as written in the source. Omit if not given.'),
      role: z
        .enum(['captain', 'vice_captain'])
        .optional()
        .describe('Only set when explicitly marked (e.g. "(c)", "captain", "vice-captain"). Omit otherwise.'),
    }),
  ),
});

const SYSTEM_PROMPT = `You extract a national-team football squad from raw text.

Rules:
- Extract EVERY player listed. Squads typically have 23–26 names for a World Cup; if you find materially fewer, the text may be incomplete — extract what's there.
- name: full name as written. Preserve diacritics. Strip "(c)" / "(captain)" markers but flag them in role.
- position: normalise to GK / DF / MF / FW. Honor section headings ("Goalkeepers", "Defenders", …) if individual rows don't carry a position.
- jersey: only if a clear number is associated with the player. Don't invent.
- date_of_birth: ISO YYYY-MM-DD if a birth date is present. Convert "12 June 1998" → "1998-06-12". Omit if absent or ambiguous.
- club_name: the player's club at call-up, exactly as written in the source — do not normalise spellings or remove "FC"/"CF" suffixes. The downstream resolver handles aliasing.
- role: 'captain' or 'vice_captain' only when the source explicitly says so.

Return an empty players array if the text does not contain a squad.`;

export async function extractSquadFromText(text: string): Promise<RawSquadEntry[]> {
  const { result } = await generateText({
    model: TEXT_MODEL,
    system: SYSTEM_PROMPT,
    prompt: text,
    schema: SquadSchema,
    temperature: 0.1,
    maxOutputTokens: 8000,
    metadata: { feature: 'footshorts-squad-extract' },
  });

  return result.players
    .filter((p) => p.name?.trim())
    .map((p) => ({
      name: p.name.trim(),
      position: p.position,
      jersey: p.jersey,
      date_of_birth: p.date_of_birth,
      club_name_raw: p.club_name,
      role: p.role ?? null,
    }));
}
