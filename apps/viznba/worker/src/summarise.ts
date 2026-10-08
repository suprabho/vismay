/**
 * NBA article classification + summarisation + entity extraction.
 *
 * Two calls, split by the kind of work (same shape as vizf1 / footshorts):
 *   1. Jev (`decide()`, typesafe-ai/jev) picks topic_category from
 *      TOPIC_CATEGORIES — a pick-one-of-N decision about text that already
 *      exists. is_nba_news is derived from it (NBA_TOPICS).
 *   2. Only for NBA news, Claude Haiku (`text.haiku`) writes the 55-60 word
 *      summary and extracts team / player / coach names. Everything else
 *      skips this call and the row is hidden. Override the text model with
 *      TEXT_MODEL (an alias like `text.sonnet` or a raw gateway id).
 *
 * Both calls go through @vismay/ai-gateway, which reads AI_GATEWAY_API_KEY or
 * the Vercel OIDC token itself. Either failing throws; ingestNews.ts marks the
 * article `failed`.
 */

import { decide, generateText } from '@vismay/ai-gateway'
import { z } from 'zod'

export const TEXT_MODEL = process.env.TEXT_MODEL || 'text.haiku'

export const TOPIC_CATEGORIES = [
  'game',
  'transaction',
  'injury',
  'draft',
  'front_office',
  'league',
  'analysis',
  'off_court',
  'other_basketball',
  'other_sport',
  'betting_fantasy',
  'unrelated',
] as const
export type TopicCategory = (typeof TOPIC_CATEGORIES)[number]

/** Topics that count as NBA news; everything else is hidden from the feed. */
export const NBA_TOPICS: ReadonlySet<TopicCategory> = new Set<TopicCategory>([
  'game',
  'transaction',
  'injury',
  'draft',
  'front_office',
  'league',
  'analysis',
  'off_court',
])

/** One criterion per category. Typed as a Record so adding a category without
 *  describing it is a compile error. */
const TOPIC_CRITERIA: Record<TopicCategory, string> = {
  game: 'NBA games: previews, recaps, results, box-score performances, on-court incidents, playoff series.',
  transaction:
    'NBA roster moves: trades, trade rumours, free-agent signings, contract extensions, waivers, buyouts, two-way deals.',
  injury: 'NBA injuries: injury news, return timelines, availability reports, load management.',
  draft: 'The NBA Draft: mock drafts, prospects being evaluated for the NBA, draft picks and lottery.',
  front_office:
    'NBA coaching and front-office news: hirings, firings, executive moves, team ownership and sales.',
  league:
    'League-wide NBA business: CBA, salary cap, media rights, expansion, rule changes, suspensions, fines, awards.',
  analysis:
    'NBA analysis and opinion: power rankings, season projections, tactical breakdowns, player or team evaluations.',
  off_court:
    "An NBA player's or coach's off-court life: legal matters, personal news, charity, media appearances.",
  other_basketball:
    'Basketball that is not the NBA: WNBA, college (unless about NBA Draft prospects), G League, EuroLeague, FIBA, high school.',
  other_sport:
    'Primarily about a sport other than basketball (NFL, MLB, NHL, soccer, …), even from an NBA outlet.',
  betting_fantasy: 'Betting picks, odds, player props, parlays, fantasy basketball and DFS advice.',
  unrelated: 'Not primarily about any sport.',
}

const TOPIC_QUESTION = {
  type: 'choice',
  instructions:
    'Classify this article for a strict NBA-only news feed. What is its PRIMARY subject? ' +
    'A basketball publisher or a passing mention of an NBA player does not make it NBA news.',
  criteria: TOPIC_CRITERIA,
} as const

/** Jev only needs the lede to decide what an article is about. */
const MAX_CLASSIFY_BODY_CHARS = 8000

export type SummariseInput = {
  headline: string
  body: string
  publisher: string
}

export type TopicVerdict = {
  topic_category: TopicCategory
  is_nba_news: boolean
  /** Jev's probability for the chosen category, when it reports a distribution. */
  confidence: number | null
  modelUsed: string
}

/** Jev's NBA-or-not decision. Throws on gateway failure. */
export async function classifyTopic(input: SummariseInput): Promise<TopicVerdict> {
  const { answers, modelUsed } = await decide({
    state: {
      publisher: input.publisher,
      headline: input.headline,
      article: input.body.slice(0, MAX_CLASSIFY_BODY_CHARS),
    },
    questions: { topic: TOPIC_QUESTION },
    metadata: { feature: 'viznba-classify' },
  })

  const parsed = z.enum(TOPIC_CATEGORIES).safeParse(answers.topic.choice)
  if (!parsed.success) {
    throw new Error(`Jev returned an unknown topic_category: ${String(answers.topic.choice)}`)
  }
  return {
    topic_category: parsed.data,
    is_nba_news: NBA_TOPICS.has(parsed.data),
    confidence: answers.topic.probabilities?.[parsed.data] ?? null,
    modelUsed,
  }
}

const WriteupSchema = z.object({
  summary: z
    .string()
    .describe('A 55-60 word neutral-tone summary, leading with the news, no opinion.'),
  entities: z.object({
    teams: z
      .array(z.string())
      .describe('NBA team names as commonly written (e.g. "Los Angeles Lakers", "76ers", "Thunder").'),
    players: z
      .array(z.string())
      .describe('Full names of NBA players (e.g. "LeBron James", "Shai Gilgeous-Alexander").'),
    coaches: z
      .array(z.string())
      .describe('Full names of NBA head coaches (e.g. "JJ Redick", "Erik Spoelstra").'),
  }),
})

const SYSTEM_PROMPT = `You summarise NBA news articles and extract the entities they are about. Every article you receive has already been classified as NBA news.

STEP 1 — Summary.
55-60 word neutral, factual summary leading with the news. No speculation, no opinion, no "reports suggest" hedging unless the original is explicitly a rumour (then say who reported it). Do not say "this article".

STEP 2 — Entities. Precision matters more than recall — when in doubt, leave it out.

An entity qualifies for tagging ONLY if BOTH are true:
  (a) It appears in the article text (do not infer from background knowledge — e.g. do not tag a player's current team unless the team is itself named in the text).
  (b) It is a primary subject OR a substantive secondary subject of the article. EXCLUDE entities that appear only in passing. Failure patterns to avoid:
       * "X's coach said Y played well." → tag Y; tag the coach only if the article is about the coach.
       * "[Y, who was traded from Z last year]" → Z is background; tag Z only if the article discusses the team itself.
       * "Not since A in 2016 has anyone done X." → A is comparison context; tag the player who did X, not A.
       * Box-score lists of every player who scored → tag the players the article actually discusses.
       * In a trade, every team and player that moves IS a subject — tag them all.

Per-type guidance:
- teams: NBA franchises only, in their common English form. No college, WNBA, G League or international clubs.
- players: current or former NBA players, full name as commonly written. No coaches, executives, referees or media.
- coaches: NBA head coaches (and interim head coaches) only. Assistants only when the article is about them being hired as a head coach.`

export type SummariseResult = {
  is_nba_news: boolean
  topic_category: TopicCategory
  summary: string
  entities: { teams: string[]; players: string[]; coaches: string[] }
  /** `<decision model>+<text model>` for NBA news, the decision model alone otherwise. */
  summary_model: string
}

export async function summariseAndTag(input: SummariseInput): Promise<SummariseResult> {
  const verdict = await classifyTopic(input)

  if (!verdict.is_nba_news) {
    // Hidden from the feed — skip the summary nobody would read.
    return {
      is_nba_news: false,
      topic_category: verdict.topic_category,
      summary: `not NBA (${verdict.topic_category})`,
      entities: { teams: [], players: [], coaches: [] },
      summary_model: verdict.modelUsed,
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
    metadata: { feature: 'viznba-summarise' },
  })

  const wc = result.summary.trim().split(/\s+/).length
  if (wc < 40 || wc > 75) {
    console.warn(`[summarise] summary word count out of range (${wc}): ${result.summary}`)
  }

  return {
    is_nba_news: true,
    topic_category: verdict.topic_category,
    summary: result.summary,
    entities: result.entities,
    summary_model: `${verdict.modelUsed}+${modelUsed}`,
  }
}
