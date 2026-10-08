/**
 * LLM-as-judge for entity tagging.
 *
 * Grades each article's currently-tagged entities in two parts, split by the
 * kind of work:
 *
 *   1. Per-tag verdicts → Jev (`decide()`, typesafe-ai/jev). Whether an
 *      existing tag is right is a pick-one-of-N decision about content that
 *      already exists: one `choice` question per tag (correct / passing
 *      mention / wrong entity / wrong type / not in text), batched ≤24 per
 *      request. `correct` → CORRECT, anything else → SPURIOUS with the option
 *      as its reason.
 *   2. MISSING entities + the one-line notes → a Claude text model
 *      (RunOpts.judgeModel, default `text.opus`). Listing what isn't there is
 *      free-form, so it can't be a decision question. Opus sees Jev's verdicts
 *      so it doesn't re-list tagged entities and its notes cover the whole
 *      article.
 *
 * Methodological note: the extractor is Claude Haiku and the judge is Jev +
 * Claude Opus — a different model for the per-tag call and a much bigger tier
 * of the same family for recall, so not a fully independent judge. Good enough
 * for catching obvious regressions and trends; layer a hand-labeled golden set
 * on top later if you want CI gating.
 */

import { decide, generateText } from '@vismay/ai-gateway';
import { z } from 'zod';
import type { EvalArticle, JudgeVerdict, TaggedEntity } from './types';

/** Text model that lists MISSING entities. Callers override via RunOpts.judgeModel. */
export const DEFAULT_JUDGE_MODEL = 'text.opus';

/** Jev answers every question in one request; chunk so each stays predictable. */
const MAX_QUESTIONS_PER_REQUEST = 24;

/** One option per verdict on an existing tag. Only `correct` counts as a true positive. */
const TAG_VERDICTS = {
  correct:
    'Correct: the entity is a primary subject, or a substantive secondary subject the article actually discusses.',
  passing_mention: 'Spurious: the entity is named, but only in passing — the article is not about it.',
  wrong_entity:
    'Spurious: the text refers to something else with the same or a similar name (wrong canonical mapping) — e.g. "Mercedes" the F1 team tagged when the article is about Mercedes-Benz cars.',
  wrong_type:
    'Spurious: the entity is relevant but tagged with the wrong type — e.g. a circuit name tagged as a team.',
  not_in_text: 'Spurious: the entity does not appear in the headline or body at all (hallucination).',
} as const;

type TagVerdict = keyof typeof TAG_VERDICTS;

/** Short reason strings for SPURIOUS entries in the report. */
const SPURIOUS_REASON: Record<Exclude<TagVerdict, 'correct'>, string> = {
  passing_mention: 'passing mention only',
  wrong_entity: 'wrong canonical mapping',
  wrong_type: 'wrong type',
  not_in_text: 'not in the text (hallucination)',
};

function tagQuestion(entity: TaggedEntity) {
  return {
    type: 'choice',
    instructions:
      `The article was auto-tagged with the ${entity.type} "${entity.name}". Is this tag correct? ` +
      `A tag is correct when the entity is a primary or substantive secondary subject of the article. ` +
      `If the body says nothing meaningful (truncated RSS, paywall), count the tag as correct when it is ` +
      `plausibly mentioned in the headline.`,
    criteria: TAG_VERDICTS,
  } as const;
}

type GradedTag = { entity: TaggedEntity; verdict: TagVerdict; probability: number | null };

function buildMissingSystemPrompt(appName: string, entityTypes: readonly string[]): string {
  return `You are grading entity-tagging recall for a ${appName} news feed.

Each article has been auto-tagged with entities of type: ${entityTypes.join(', ')}. Every existing tag has already been graded (shown next to it). Your job is only to find what is MISSING.

MISSING: entities the article IS clearly about but that were NOT tagged. Be strict: only flag primary or substantive secondary subjects, not every named entity in the body.

Rules:
- Use exactly these type strings for missing entries: ${entityTypes.join(', ')}.
- Do not list an entity that is already tagged, under any spelling — even if its tag was graded spurious.
- An empty list is fine and common.
- If the body says nothing meaningful (truncated RSS, paywall), list only what the headline makes obvious and say so in notes.
- notes: one sentence (max 25 words) explaining the overall verdict, covering the graded tags and anything missing.`;
}

/** Structured output for the recall pass — enforced by tool-calling on Claude. */
const MissingSchema = z.object({
  missing: z.array(
    z.object({
      type: z.string().describe('One of the entity type strings listed in the instructions.'),
      name: z.string(),
      reason: z.string().describe('Short reason it should have been tagged.'),
    }),
  ),
  notes: z.string().describe('One sentence (max 25 words) explaining the overall verdict.'),
});

export type Judge = (article: EvalArticle) => Promise<JudgeVerdict | { error: string }>;

/** Extra attempts on a rate limit, on top of the AI SDK's own retries. */
const MAX_RATE_LIMIT_RETRIES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * How long to wait before retrying a rate-limited call, or null when the error
 * isn't a rate limit. The AI SDK already retries transient failures with
 * backoff and wraps the last one in a RetryError (`lastError`); at
 * EVAL_CONCURRENCY=10 a 429 can still outlast that, so pace a little more,
 * honouring Retry-After when the gateway sends one.
 */
function rateLimitWaitMs(err: unknown, attempt: number): number | null {
  const e = (err as { lastError?: unknown })?.lastError ?? err;
  const status = (e as { statusCode?: number })?.statusCode;
  const msg = e instanceof Error ? e.message : String(e);
  if (status !== 429 && !/\b429\b|rate.?limit|too many requests/i.test(msg)) return null;
  const retryAfter = Number((e as { responseHeaders?: Record<string, string> })?.responseHeaders?.['retry-after']);
  const base = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5_000 * 2 ** attempt;
  // Jitter so parallel workers don't all fire again at the same instant.
  return Math.min(60_000, base) + Math.random() * 2_000;
}

async function withRateLimitBackoff<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (e) {
      const waitMs = rateLimitWaitMs(e, attempt);
      if (waitMs === null || attempt >= MAX_RATE_LIMIT_RETRIES) throw e;
      await sleep(waitMs);
    }
  }
}

export function createJudge(opts: {
  /** Text model for the MISSING list + notes — alias (`text.opus`) or gateway id. */
  model: string;
  appName: string;
  entityTypes: readonly string[];
  /** Decision model for per-tag verdicts. Default: decide()'s own (JEV_MODEL or decision.jev). */
  decisionModel?: string;
}): Judge {
  const system = buildMissingSystemPrompt(opts.appName, opts.entityTypes);
  const metadata = { feature: `eval-entities-${opts.appName}` };

  async function gradeTags(article: EvalArticle): Promise<GradedTag[]> {
    const state = {
      app: opts.appName,
      tag_types: opts.entityTypes.join(', '),
      publisher: article.publisher,
      headline: article.headline,
      body: article.body,
    };
    const graded: GradedTag[] = [];
    for (let from = 0; from < article.taggedEntities.length; from += MAX_QUESTIONS_PER_REQUEST) {
      const batch = article.taggedEntities.slice(from, from + MAX_QUESTIONS_PER_REQUEST);
      const questions = Object.fromEntries(batch.map((e, i) => [`t${i}`, tagQuestion(e)]));
      const { answers } = await withRateLimitBackoff(() =>
        decide({ model: opts.decisionModel, state, questions, metadata }),
      );
      batch.forEach((entity, i) => {
        const answer = answers[`t${i}`];
        if (!answer || !(answer.choice in TAG_VERDICTS)) {
          throw new Error(`no usable Jev verdict for ${entity.name} [${entity.type}]`);
        }
        graded.push({
          entity,
          verdict: answer.choice,
          probability: answer.probabilities?.[answer.choice] ?? null,
        });
      });
    }
    return graded;
  }

  async function findMissing(
    article: EvalArticle,
    graded: GradedTag[],
  ): Promise<Pick<JudgeVerdict, 'missing' | 'notes'>> {
    const taggedList =
      graded.length === 0
        ? '(none)'
        : graded
            .map(({ entity, verdict }) =>
              verdict === 'correct'
                ? `- ${entity.name} [${entity.type}] — correct`
                : `- ${entity.name} [${entity.type}] — spurious: ${SPURIOUS_REASON[verdict]}`,
            )
            .join('\n');

    const prompt = `Publisher: ${article.publisher}
Headline: ${article.headline}

Body:
${article.body}

Currently-tagged entities (already graded):
${taggedList}`;

    const { result } = await withRateLimitBackoff(() =>
      generateText({
        model: opts.model,
        system,
        prompt,
        schema: MissingSchema,
        temperature: 0.1,
        maxOutputTokens: 2000,
        metadata,
      }),
    );
    return result;
  }

  return async function judge(article) {
    try {
      const graded = await gradeTags(article);
      const { missing, notes } = await findMissing(article, graded);
      const correct: JudgeVerdict['correct'] = [];
      const spurious: JudgeVerdict['spurious'] = [];
      for (const { entity, verdict, probability } of graded) {
        if (verdict === 'correct') {
          correct.push({ type: entity.type, name: entity.name });
        } else {
          const p = probability == null ? '' : ` (Jev ${(probability * 100).toFixed(0)}%)`;
          spurious.push({ type: entity.type, name: entity.name, reason: `${SPURIOUS_REASON[verdict]}${p}` });
        }
      }
      return { correct, spurious, missing, notes };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  };
}
