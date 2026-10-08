/**
 * Article classification + summarization + entity extraction.
 *
 * Two calls, split by the kind of work:
 *   1. Jev (`decide()`, typesafe-ai/jev) picks topic_category from the eight
 *      TOPIC_CATEGORIES — a pick-one-of-N decision about text that already
 *      exists, so it goes to a decision model rather than a writer.
 *      is_football_news is derived from it: on_pitch / transfer / club_business.
 *   2. Only for football articles, Claude Haiku (`text.haiku`) writes the
 *      55–60 word English summary, the English headline, and extracts entity
 *      names. Non-football articles skip this call entirely — the row is hidden.
 *
 * Why Haiku: high-volume per-item work (hundreds of articles a day), 60-word
 * summaries and name extraction don't need a bigger tier. Override with
 * TEXT_MODEL (an alias like `text.sonnet` or a raw gateway id) to A/B.
 *
 * Both calls go through the shared Vercel AI Gateway client (@vismay/ai-gateway),
 * which reads AI_GATEWAY_API_KEY or the Vercel OIDC token itself. Either call
 * failing throws, and ingest.ts marks the article `failed`.
 */

import { decide, generateText } from '@vismay/ai-gateway';
import { z } from 'zod';
import {
  ArticleSummary,
  TopicCategory,
  TopicCategorySchema,
} from '@footshorts/shared/schemas';

const TEXT_MODEL = process.env.TEXT_MODEL || 'text.haiku';

/** Topics that count as football news; everything else is hidden from the feed. */
export const FOOTBALL_TOPICS: ReadonlySet<TopicCategory> = new Set<TopicCategory>([
  'on_pitch',
  'transfer',
  'club_business',
]);

/** Jev only needs the lede to decide what an article is about. Claude still
 *  sees the full body for the summary. */
const MAX_CLASSIFY_BODY_CHARS = 8000;

/** The strict football-only rules, one criterion per category. Typed as a
 *  Record so adding a category to TopicCategorySchema without describing it
 *  here is a compile error. */
const TOPIC_CRITERIA: Record<TopicCategory, string> = {
  on_pitch:
    'Football on the pitch: match reports, previews, goals, tactics, team selection, on-pitch injuries. ' +
    "Also a footballer's off-pitch matter (e.g. a ban) when it directly affects their playing status.",
  transfer: 'Football transfers, contracts, signings, loans and contract renewals.',
  club_business:
    'Football club business: ownership, sackings, manager appointments and moves, club finances.',
  off_pitch_personal:
    "A footballer's off-pitch personal, legal or charity life that does NOT affect their playing status.",
  other_sport:
    'Primarily about a sport other than football — cricket, F1, NFL, tennis, boxing, golf, rugby or any ' +
    'other — even when published by a football outlet (e.g. Sky Sports, BBC Sport).',
  betting_odds:
    "Prediction games, betting tips, pundit forecast challenges (\"X predicts the weekend's results\"), odds roundups.",
  listicle: 'Generic top-N lists spanning multiple sports or topics.',
  unrelated: 'Truly unrelated content — not primarily about football or any sport.',
};

const TOPIC_QUESTION = {
  type: 'choice',
  instructions:
    'Classify this article for a strict football-only news feed. What is its PRIMARY subject? ' +
    'It is football news only if it is primarily about football itself: the sport, its on-pitch ' +
    'players, clubs, matches, transfers, managers or competitions. A football publisher or a ' +
    'passing mention of a footballer does not make it football. The article may be in a language ' +
    'other than English; classify from the original text.',
  criteria: TOPIC_CRITERIA,
} as const;

export type SummarizeInput = {
  headline: string;
  body: string; // full article text or RSS description
  publisher: string;
  /** ISO 639-1 language of the source feed ('es', ...). Omit for English. */
  language?: string;
};

export type TopicVerdict = {
  topic_category: TopicCategory;
  is_football_news: boolean;
  /** Jev's probability for the chosen category, when it reports a distribution. */
  confidence: number | null;
  /** Decision model that answered. */
  modelUsed: string;
};

/**
 * Jev's football-or-not decision. Exported so evalFootballFilter.ts measures
 * exactly the classifier ingest runs. Throws on gateway failure.
 */
export async function classifyTopic(input: SummarizeInput): Promise<TopicVerdict> {
  const { answers, modelUsed } = await decide({
    state: {
      publisher: input.publisher,
      ...(input.language && input.language !== 'en' ? { language: input.language } : {}),
      headline: input.headline,
      article: input.body.slice(0, MAX_CLASSIFY_BODY_CHARS),
    },
    questions: { topic: TOPIC_QUESTION },
    metadata: { feature: 'footshorts-classify' },
  });

  const parsed = TopicCategorySchema.safeParse(answers.topic.choice);
  if (!parsed.success) {
    throw new Error(`Jev returned an unknown topic_category: ${String(answers.topic.choice)}`);
  }
  const topic = parsed.data;
  return {
    topic_category: topic,
    is_football_news: FOOTBALL_TOPICS.has(topic),
    confidence: answers.topic.probabilities?.[topic] ?? null,
    modelUsed,
  };
}

// Writing + extraction — Claude only ever sees football articles.
const WriteupSchema = z.object({
  summary: z
    .string()
    .describe(
      'A 55-60 word neutral-tone summary IN ENGLISH (translate if the article is in another language), leading with the news, no opinion.',
    ),
  headline_en: z
    .string()
    .describe(
      'The article headline in natural English. If the original headline is already English, copy it verbatim; otherwise translate it faithfully without editorializing.',
    ),
  entities: z.object({
    leagues: z
      .array(z.string())
      .describe('League/competition names (e.g., "Premier League", "Champions League").'),
    teams: z.array(z.string()).describe('Club/team names (e.g., "Arsenal", "Real Madrid").'),
    players: z
      .array(z.string())
      .describe('On-pitch footballer names (e.g., "Bukayo Saka", "Vinícius Jr").'),
  }),
});

const SYSTEM_PROMPT = `You summarize football news articles and extract the entities they are about. Every article you receive has already been classified as football news.

Articles may arrive in languages other than English (e.g. Spanish outlets like Marca, Diario AS, Mundo Deportivo). ALL of your output — summary, headline_en, entity names — must be in English, regardless of the article's language. Translate faithfully, never editorialize. Keep proper nouns as commonly written in English media (e.g. "fichaje" → "signing", but "Real Madrid" stays "Real Madrid").

STEP 1 — Summary.
Write a 55-60 word neutral, factual summary in English. Lead with the news itself. No speculation, no opinion, no "reports suggest" hedging unless the original is explicitly rumor-based. Do not mention that this is a summary or a translation.
Also fill headline_en: the headline in natural English (copied verbatim when the original is already English, translated faithfully otherwise).

STEP 2 — Entities. Precision matters more than recall — when in doubt, leave it out.

An entity qualifies for tagging ONLY if BOTH are true:
  (a) It appears in the article text (do not infer from background knowledge — e.g. do not tag a player's current club unless the club is itself named in the text).
  (b) It is a primary subject OR a substantive secondary subject of the article. EXCLUDE entities that appear only in passing. Failure patterns to avoid:
       * "X confirmed Y did Z." → tag Y, not X (X is providing context).
       * "[Y, who plays for Z]" → Z is parenthetical; tag Z only if the article discusses the club itself.
       * "Unlike A last season, B did X today." → A is comparison context; tag B, not A.
       * "Fans at the X stadium chanted." → X (the club) only when the article discusses the club, not just the venue.

Per-type guidance:
- leagues: competition names (Premier League, La Liga, Champions League, FA Cup, etc.)
- teams: clubs or national teams (Arsenal, Brazil, etc.) — use the common English name.
- players: full name as commonly known. On-field footballers only — no managers, referees, or pundits.`;

/** What summarizeAndTag returns: the shared ArticleSummary shape plus the
 *  model string to store in articles.summary_model. */
export type SummarizeResult = ArticleSummary & {
  /** `<decision model>+<text model>` for football, the decision model alone otherwise. */
  summary_model: string;
};

export async function summarizeAndTag(input: SummarizeInput): Promise<SummarizeResult> {
  const verdict = await classifyTopic(input);

  if (!verdict.is_football_news) {
    // Hidden from the feed — no point paying for a summary nobody reads.
    return {
      is_football_news: false,
      topic_category: verdict.topic_category,
      summary: `not football (${verdict.topic_category})`,
      entities: { leagues: [], teams: [], players: [] },
      summary_model: verdict.modelUsed,
    };
  }

  const prompt = `Publisher: ${input.publisher}${input.language && input.language !== 'en' ? `
Article language: ${input.language} (translate all output to English)` : ''}
Headline: ${input.headline}

Article:
${input.body}`;

  const { result, modelUsed } = await generateText({
    model: TEXT_MODEL,
    system: SYSTEM_PROMPT,
    prompt,
    schema: WriteupSchema,
    temperature: 0.2, // low temp — we want factual, deterministic output
    maxOutputTokens: 1500,
    metadata: { feature: 'footshorts-summarize' },
  });

  const wordCount = result.summary.trim().split(/\s+/).length;
  if (wordCount < 40 || wordCount > 75) {
    console.warn(`Summary word count out of range (${wordCount}): ${result.summary}`);
  }

  return {
    is_football_news: true,
    topic_category: verdict.topic_category,
    summary: result.summary,
    headline_en: result.headline_en,
    entities: result.entities,
    summary_model: `${verdict.modelUsed}+${modelUsed}`,
  };
}
