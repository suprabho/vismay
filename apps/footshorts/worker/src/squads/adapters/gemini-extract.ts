/**
 * Gemini-backed squad extractor. Shared by the press-release and manual
 * adapters: both feed raw text in and get RawSquadEntry[] out.
 *
 * Mirrors the structured-output pattern in ../../gemini.ts — same model,
 * same low temperature, same hard schema. The instruction is squad-specific
 * (extract every player, normalize positions, keep clubs as written).
 */

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { RawSquadEntry, SquadPosition } from '../types';

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  throw new Error('GEMINI_API_KEY required for squad extraction');
}

const genAI = new GoogleGenerativeAI(API_KEY);

const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    players: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING, description: 'Full player name as written in the source.' },
          position: {
            type: SchemaType.STRING,
            enum: ['GK', 'DF', 'MF', 'FW'] as unknown as string[],
            description: 'Goalkeeper, Defender, Midfielder, or Forward. Best guess from any position label or section header.',
          },
          jersey: { type: SchemaType.INTEGER, description: 'Jersey number if given. Omit otherwise.' },
          date_of_birth: { type: SchemaType.STRING, description: 'ISO YYYY-MM-DD if a date appears. Omit otherwise.' },
          club_name: { type: SchemaType.STRING, description: 'Club at call-up time, exactly as written in the source. Omit if not given.' },
          role: {
            type: SchemaType.STRING,
            enum: ['captain', 'vice_captain'] as unknown as string[],
            description: 'Only set when explicitly marked (e.g. "(c)", "captain", "vice-captain"). Omit otherwise.',
          },
        },
        required: ['name'],
      },
    },
  },
  required: ['players'],
};

const SYSTEM_INSTRUCTION = `You extract a national-team football squad from raw text.

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
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema as any,
      temperature: 0.1,
      maxOutputTokens: 8000,
    },
  });

  const result = await model.generateContent(text);
  const raw = result.response.text();

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Gemini returned non-JSON: ${raw.slice(0, 200)}`);
  }

  const players: any[] = Array.isArray(parsed?.players) ? parsed.players : [];
  return players
    .filter((p) => p?.name)
    .map((p) => ({
      name: String(p.name).trim(),
      position: p.position as SquadPosition | undefined,
      jersey: typeof p.jersey === 'number' ? p.jersey : undefined,
      date_of_birth: typeof p.date_of_birth === 'string' ? p.date_of_birth : undefined,
      club_name_raw: typeof p.club_name === 'string' ? p.club_name : undefined,
      role: p.role === 'captain' || p.role === 'vice_captain' ? p.role : null,
    }));
}
