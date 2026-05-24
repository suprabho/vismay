/**
 * Gemini summarisation + entity tagging for F1 articles.
 *
 * Uses the @google/genai SDK (gemma/gemini 3.x line — 2.5 is deprecated as of
 * 2026). Defaults to `gemini-3.1-flash-lite` (cheaper, plenty good for 60-word
 * summaries); override with GEMINI_MODEL.
 *
 * Returns a strict JSON shape:
 *   - is_f1_news: drops non-F1 cross-sport / generic listicle articles
 *   - topic_category: on_track | off_track | transfer | regs | other
 *   - summary: 55-60 word neutral summary
 *   - entities.drivers / teams / circuits: free-text names; resolver maps to IDs.
 */

import { GoogleGenAI, Type } from '@google/genai'
import { z } from 'zod'

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite'
const API_KEY = process.env.GEMINI_API_KEY

if (!API_KEY) {
  throw new Error('GEMINI_API_KEY required')
}

const TOPIC_CATEGORIES = ['on_track', 'off_track', 'transfer', 'regs', 'other'] as const

export const GeminiF1SummarySchema = z.object({
  is_f1_news: z.boolean(),
  topic_category: z.enum(TOPIC_CATEGORIES),
  summary: z.string(),
  entities: z.object({
    drivers: z.array(z.string()),
    teams: z.array(z.string()),
    circuits: z.array(z.string()),
  }),
})
export type GeminiF1Summary = z.infer<typeof GeminiF1SummarySchema>

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    is_f1_news: {
      type: Type.BOOLEAN,
      description:
        'True only if the article is primarily about Formula 1 — the sport, its drivers, teams, races, regulations, or paddock business. False for cross-sport coverage (NASCAR, IndyCar, MotoGP), betting/prediction roundups, and generic listicles.',
    },
    topic_category: {
      type: Type.STRING,
      enum: [...TOPIC_CATEGORIES] as unknown as string[],
      description: 'Best-fit category.',
    },
    summary: {
      type: Type.STRING,
      description:
        'If is_f1_news=true: a 55-60 word neutral-tone summary, leading with the news, no opinion. Otherwise: a one-line note explaining what the article is about (discarded).',
    },
    entities: {
      type: Type.OBJECT,
      properties: {
        drivers: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Driver names mentioned (e.g. "Max Verstappen", "Lando Norris"). Empty when is_f1_news=false.',
        },
        teams: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Constructor / team names (e.g. "Red Bull", "Ferrari"). Empty when is_f1_news=false.',
        },
        circuits: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Circuit / grand prix names (e.g. "Monaco", "Silverstone"). Empty when is_f1_news=false.',
        },
      },
      required: ['drivers', 'teams', 'circuits'],
    },
  },
  required: ['is_f1_news', 'topic_category', 'summary', 'entities'],
}

const SYSTEM_INSTRUCTION = `You are a strict Formula-1-only news classifier and summariser.

STEP 1 — Classify. Decide is_f1_news. Be strict:
- The article must be PRIMARILY about Formula 1 (the sport, its drivers, teams, races, regulations, or paddock business).
- Even from a motorsport publisher, if the article is primarily about IndyCar, NASCAR, MotoGP, F2, F3, or any other series → is_f1_news=false, topic_category='other'.
- Prediction games, betting tips, generic top-N lists → is_f1_news=false, topic_category='other'.
- Match reports, race results, qualifying, sprint, practice analysis, on-track incidents → topic_category='on_track'.
- Off-track personal life, driver appearances, charity → topic_category='off_track'.
- Driver moves, contract news, team announcements → topic_category='transfer'.
- Technical regulations, sporting regulations, FIA decisions → topic_category='regs'.

STEP 2 — Summary.
If is_f1_news=true: 55-60 word neutral, factual summary leading with the news. No speculation, no opinion. Do not say "this article".
If is_f1_news=false: one-line note describing the actual topic.

STEP 3 — Entities. Only when is_f1_news=true. Precision matters more than recall — when in doubt, leave it out.

An entity qualifies for tagging ONLY if BOTH are true:
  (a) It appears in the article text (do not infer from background knowledge — e.g. do not tag a driver's current team unless the team is itself named in the text).
  (b) It is a primary subject OR a substantive secondary subject of the article. EXCLUDE entities that appear only in passing. Failure patterns to avoid:
       * "X confirmed Y did Z." → tag Y, not X (X is providing context).
       * "[Y, who drives for Z]" → Z is parenthetical; tag Z only if the article discusses the team itself.
       * "Unlike A last year, B did X today." → A is comparison context; tag B, not A.
       * "Fans at the X circuit applauded." → X is a circuit only if the article actually discusses the circuit, race, or event there.

Per-type guidance:
- drivers: full names of F1 drivers mentioned. On-track drivers only — no reserve, no junior series unless clearly graduating.
- teams: constructor names using the common English form ("Red Bull", "Aston Martin", "RB", "Sauber" — not the long sponsor name).
- circuits: grand prix or circuit names ("Monaco", "Silverstone", "Suzuka"). Prefer the specific circuit name (e.g. "Circuit Gilles Villeneuve") over the city when both appear. Do NOT tag a city as a circuit just because a race happens there — only when the article is actually about events at that circuit.

Empty arrays when is_f1_news=false.`

const client = new GoogleGenAI({ apiKey: API_KEY })

export type GeminiInput = {
  headline: string
  body: string
  publisher: string
}

export async function summariseAndTag(input: GeminiInput): Promise<GeminiF1Summary> {
  const prompt = `Publisher: ${input.publisher}
Headline: ${input.headline}

Article:
${input.body}`

  const response = await client.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      responseSchema: responseSchema as any,
      temperature: 0.2,
    },
  })

  const text = response.text ?? ''
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`Gemini returned non-JSON: ${text.slice(0, 200)}`)
  }

  const validated = GeminiF1SummarySchema.safeParse(parsed)
  if (!validated.success) {
    throw new Error(`Gemini output failed schema: ${validated.error.message}`)
  }

  if (validated.data.is_f1_news) {
    const wc = validated.data.summary.trim().split(/\s+/).length
    if (wc < 40 || wc > 75) {
      console.warn(`[gemini] summary word count out of range (${wc}): ${validated.data.summary}`)
    }
  }

  return validated.data
}

export const GEMINI_MODEL = MODEL
