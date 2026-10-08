/**
 * F1 article classification + summarisation + entity tagging.
 *
 * Two calls, split by the kind of work:
 *   1. Jev (`decide()`, typesafe-ai/jev) answers the decisions in one round
 *      trip: is this F1 news (boolean) and which topic_category it is (choice).
 *   2. Only for F1 news, Claude Haiku (`text.haiku`) writes the 55-60 word
 *      summary and extracts driver / team / circuit names. Non-F1 articles
 *      skip this call — the row is hidden. Override the text model with
 *      TEXT_MODEL (an alias like `text.sonnet` or a raw gateway id).
 *
 * Returns a strict shape (F1SummarySchema):
 *   - is_f1_news: drops non-F1 cross-sport / generic listicle articles
 *   - topic_category: on_track | off_track | transfer | regs | other
 *   - summary: 55-60 word neutral summary (a short placeholder when not F1)
 *   - entities.drivers / teams / circuits: free-text names; resolver maps to IDs.
 * plus summary_model, the models that actually answered.
 *
 * Both calls go through @vismay/ai-gateway, which reads AI_GATEWAY_API_KEY or
 * the Vercel OIDC token itself. Either failing throws; ingestNews.ts marks the
 * article `failed`.
 */

import { decide, generateText } from '@vismay/ai-gateway'
import { z } from 'zod'

export const TEXT_MODEL = process.env.TEXT_MODEL || 'text.haiku'

const TOPIC_CATEGORIES = ['on_track', 'off_track', 'transfer', 'regs', 'other'] as const
type TopicCategory = (typeof TOPIC_CATEGORIES)[number]

export const F1SummarySchema = z.object({
  is_f1_news: z.boolean(),
  topic_category: z.enum(TOPIC_CATEGORIES),
  summary: z.string(),
  entities: z.object({
    drivers: z.array(z.string()),
    teams: z.array(z.string()),
    circuits: z.array(z.string()),
  }),
})
export type F1Summary = z.infer<typeof F1SummarySchema>

/** Jev only needs the lede to decide what an article is about. */
const MAX_CLASSIFY_BODY_CHARS = 8000

/** P(is_f1_news) at or above this counts as F1 news. */
const F1_NEWS_THRESHOLD = 0.5

const IS_F1_QUESTION = {
  type: 'boolean',
  instructions:
    'Is this article primarily about Formula 1 — the sport, its drivers, teams, races, regulations, or ' +
    'paddock business? Be strict: a motorsport publisher does not make it F1.',
  criteria: {
    true: 'The PRIMARY subject is Formula 1.',
    false:
      'Primarily about another series (IndyCar, NASCAR, MotoGP, F2, F3 or any other), a prediction game ' +
      'or betting tips, a generic top-N list, or anything else that is not mainly F1.',
  },
} as const

const TOPIC_CRITERIA: Record<TopicCategory, string> = {
  on_track: 'Race reports and results, qualifying, sprint, practice analysis, on-track incidents.',
  off_track: 'Off-track personal life, driver appearances, charity.',
  transfer: 'Driver moves, contract news, team announcements.',
  regs: 'Technical regulations, sporting regulations, FIA decisions.',
  other:
    'Not F1: other series (IndyCar, NASCAR, MotoGP, F2, F3, …), prediction games, betting tips, generic top-N lists.',
}

const TOPIC_QUESTION = {
  type: 'choice',
  instructions: 'Which category best fits this article?',
  criteria: TOPIC_CRITERIA,
} as const

const WriteupSchema = z.object({
  summary: z
    .string()
    .describe('A 55-60 word neutral-tone summary, leading with the news, no opinion.'),
  entities: z.object({
    drivers: z
      .array(z.string())
      .describe('Driver names (e.g. "Max Verstappen", "Lando Norris").'),
    teams: z.array(z.string()).describe('Constructor / team names (e.g. "Red Bull", "Ferrari").'),
    circuits: z
      .array(z.string())
      .describe('Circuit / grand prix names (e.g. "Monaco", "Silverstone").'),
  }),
})

const SYSTEM_PROMPT = `You summarise Formula 1 news articles and extract the entities they are about. Every article you receive has already been classified as F1 news.

STEP 1 — Summary.
55-60 word neutral, factual summary leading with the news. No speculation, no opinion. Do not say "this article".

STEP 2 — Entities. Precision matters more than recall — when in doubt, leave it out.

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
- circuits: grand prix or circuit names ("Monaco", "Silverstone", "Suzuka"). Prefer the specific circuit name (e.g. "Circuit Gilles Villeneuve") over the city when both appear. Do NOT tag a city as a circuit just because a race happens there — only when the article is actually about events at that circuit.`

export type SummariseInput = {
  headline: string
  body: string
  publisher: string
}

export type SummariseResult = F1Summary & {
  /** `<decision model>+<text model>` for F1 news, the decision model alone otherwise. */
  summary_model: string
}

export async function summariseAndTag(input: SummariseInput): Promise<SummariseResult> {
  const { answers, modelUsed: decisionModel } = await decide({
    state: {
      publisher: input.publisher,
      headline: input.headline,
      article: input.body.slice(0, MAX_CLASSIFY_BODY_CHARS),
    },
    questions: { is_f1_news: IS_F1_QUESTION, topic: TOPIC_QUESTION },
    metadata: { feature: 'vizf1-classify' },
  })

  const topic = z.enum(TOPIC_CATEGORIES).safeParse(answers.topic.choice)
  if (!topic.success) {
    throw new Error(`Jev returned an unknown topic_category: ${String(answers.topic.choice)}`)
  }
  const isF1 = answers.is_f1_news.probability >= F1_NEWS_THRESHOLD

  if (!isF1) {
    // Hidden from the feed — skip the summary nobody would read.
    return {
      is_f1_news: false,
      topic_category: topic.data,
      summary: `not F1 (${topic.data})`,
      entities: { drivers: [], teams: [], circuits: [] },
      summary_model: decisionModel,
    }
  }

  const prompt = `Publisher: ${input.publisher}
Headline: ${input.headline}

Article:
${input.body}`

  const { result, modelUsed } = await generateText({
    model: TEXT_MODEL,
    system: SYSTEM_PROMPT,
    prompt,
    schema: WriteupSchema,
    temperature: 0.2,
    maxOutputTokens: 1500,
    metadata: { feature: 'vizf1-summarise' },
  })

  const wc = result.summary.trim().split(/\s+/).length
  if (wc < 40 || wc > 75) {
    console.warn(`[summarise] summary word count out of range (${wc}): ${result.summary}`)
  }

  return {
    is_f1_news: true,
    topic_category: topic.data,
    summary: result.summary,
    entities: result.entities,
    summary_model: `${decisionModel}+${modelUsed}`,
  }
}
