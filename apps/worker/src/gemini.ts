/**
 * Gemini summarization + entity extraction.
 *
 * Uses Gemini 2.5 Flash with structured JSON output.
 * Why Flash: cheap (~$0.0003 per article), fast (~1s), quality is plenty for 60-word summaries.
 * Swap model via GEMINI_MODEL env var if you want to A/B test Pro.
 *
 * Cost estimate at 500 articles/day:
 *   ~15k tokens in + ~100 tokens out per call
 *   ~$0.0003 per article × 500 × 30 days ≈ $4.50/month. Trivial.
 */

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { GeminiSummary, GeminiSummarySchema } from '@shortfoot/shared/schemas';

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  throw new Error('GEMINI_API_KEY required');
}

const genAI = new GoogleGenerativeAI(API_KEY);

const TOPIC_CATEGORIES = [
  'on_pitch',
  'transfer',
  'club_business',
  'off_pitch_personal',
  'other_sport',
  'betting_odds',
  'listicle',
  'unrelated',
] as const;

// Structured output schema — Gemini will conform to this
const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    is_football_news: {
      type: SchemaType.BOOLEAN,
      description:
        'True only if the PRIMARY subject of the article is football (the sport, its players, clubs, matches, transfers, competitions, or managers). False for cross-sport coverage, betting/prediction roundups, generic listicles, or off-pitch personal news that does not affect playing status.',
    },
    topic_category: {
      type: SchemaType.STRING,
      enum: [...TOPIC_CATEGORIES] as unknown as string[],
      description: 'Best-fit category for the article.',
    },
    summary: {
      type: SchemaType.STRING,
      description:
        'If is_football_news=true: a 55-60 word neutral-tone summary, leading with the news, no opinion. If is_football_news=false: a one-line note describing what the article is actually about (will be discarded).',
    },
    entities: {
      type: SchemaType.OBJECT,
      properties: {
        leagues: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: 'League/competition names mentioned (e.g., "Premier League", "Champions League"). Empty when is_football_news=false.',
        },
        teams: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: 'Club/team names mentioned (e.g., "Arsenal", "Real Madrid"). Empty when is_football_news=false.',
        },
        players: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: 'On-pitch footballer names (e.g., "Bukayo Saka", "Vinícius Jr"). Empty when is_football_news=false.',
        },
      },
      required: ['leagues', 'teams', 'players'],
    },
  },
  required: ['is_football_news', 'topic_category', 'summary', 'entities'],
};

const SYSTEM_INSTRUCTION = `You are a strict football-only news classifier and summarizer.

STEP 1 — Classify. Decide is_football_news. Be strict:
- The article must be PRIMARILY about football: the sport itself, its players (on-pitch), clubs, matches, transfers, managers, or competitions.
- Even from a football publisher (e.g. Sky Sports, BBC Sport), if the article is primarily about cricket, F1, NFL, tennis, boxing, golf, rugby, or any non-football sport → is_football_news=false, topic_category='other_sport'.
- Prediction games, betting tips, pundit forecast challenges ("X predicts the weekend's results"), odds roundups → is_football_news=false, topic_category='betting_odds'.
- Generic top-N lists spanning multiple sports or topics → is_football_news=false, topic_category='listicle'.
- A footballer's off-pitch personal/legal/charity life → is_football_news=false, topic_category='off_pitch_personal', UNLESS it directly affects their playing status (e.g. a ban that keeps them out of matches).
- Truly unrelated content → is_football_news=false, topic_category='unrelated'.
- Match reports, goals, tactics, on-pitch injuries → is_football_news=true, topic_category='on_pitch'.
- Transfers, contracts, signings → is_football_news=true, topic_category='transfer'.
- Ownership, sackings, club finances, manager moves → is_football_news=true, topic_category='club_business'.

STEP 2 — Summary.
If is_football_news=true: write a 55-60 word neutral, factual summary. Lead with the news itself. No speculation, no opinion, no "reports suggest" hedging unless the original is explicitly rumor-based. Do not mention that this is a summary.
If is_football_news=false: write a one-line note describing what the article is actually about. It will not be shown to users.

STEP 3 — Entities. Only extract when is_football_news=true:
- leagues: competition names (Premier League, La Liga, Champions League, FA Cup, etc.)
- teams: clubs or national teams (Arsenal, Brazil, etc.) — use the common English name.
- players: full name as commonly known. On-field footballers only — no managers, referees, or pundits.
When is_football_news=false, return empty arrays for all three.

Do not invent entities not in the text. Be precise.`;

export type GeminiInput = {
  headline: string;
  body: string; // full article text or RSS description
  publisher: string;
};

export async function summarizeAndTag(
  input: GeminiInput
): Promise<GeminiSummary> {
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema as any,
      temperature: 0.2, // low temp — we want factual, deterministic output
      // Gemini 2.5 Flash "thinking tokens" count against this budget; headroom matters.
      maxOutputTokens: 4000,
    },
  });

  const prompt = `Publisher: ${input.publisher}
Headline: ${input.headline}

Article:
${input.body}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`Gemini returned non-JSON: ${text.slice(0, 200)}`);
  }

  const validated = GeminiSummarySchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`Gemini output failed schema: ${validated.error.message}`);
  }

  // Word-count sanity check only applies to football summaries; non-football articles get a one-liner that's discarded.
  if (validated.data.is_football_news) {
    const wordCount = validated.data.summary.trim().split(/\s+/).length;
    if (wordCount < 40 || wordCount > 75) {
      console.warn(`Summary word count out of range (${wordCount}): ${validated.data.summary}`);
    }
  }

  return validated.data;
}
