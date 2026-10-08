/**
 * Jev entity-tag precision gate.
 *
 * Claude Haiku extracts entity names (summarize.ts STEP 2) and entityResolver
 * maps them to canonical rows. Extraction is the part a text model is good at;
 * deciding whether a named club is actually what the article is ABOUT is a
 * different job, and it's the one the eval keeps scoring as SPURIOUS — the
 * four failure patterns spelled out in summarize.ts's STEP 2 ("X confirmed Y
 * did Z", parenthetical clubs, comparison context, stadium-as-venue) are all
 * passing mentions that survive extraction.
 *
 * So we re-ask, per candidate, as a typed yes/no. Jev is a System One model:
 * state plus named questions in, a calibrated probability per question out, no
 * prose. One boolean question per candidate, all of them batched into a single
 * round trip, and the probability lands in `article_entities.confidence` — a
 * column that has existed since the init migration and was never written to
 * before this gate.
 *
 * Calls go through `decide()` from @vismay/ai-gateway — the same Vercel AI
 * Gateway client admin and story-pipeline run on, so auth is shared: an
 * explicit AI_GATEWAY_API_KEY locally, or the OIDC token Vercel injects at
 * deploy time. Retries (with backoff) and the overall timeout live there too.
 *
 * Why this shape and not "let Jev do the tagging": Jev only answers
 * boolean/choice/score questions. It cannot emit a free-text list of entities,
 * so it can't replace extraction — it can only judge candidates that already
 * exist. Recall still belongs entirely to Claude Haiku and the resolver; this
 * gate only ever removes tags, never adds them.
 *
 * FAILS OPEN. No gateway credentials, a 5xx, a timeout — every candidate is
 * kept at confidence 1.0, exactly as before this file existed. A third-party
 * judge being down must not silently empty the follow graph that the story
 * rings (web/lib/useFollowedStories.ts) are built from.
 *
 * Env:
 *   AI_GATEWAY_API_KEY           — the shared gateway key; on Vercel the
 *                                  injected OIDC token stands in for it
 *   JEV_ENTITY_GATE=0            — kill switch, leaves credentials in place
 *   JEV_ENTITY_MIN_CONFIDENCE    — keep threshold, default 0.55
 *   JEV_MODEL                    — decision model id, default `typesafe-ai/jev`
 *                                  (read by decide() itself)
 *   AI_GATEWAY_DECIDE_TIMEOUT_MS — overall budget per request incl. retries,
 *                                  default 30000 (read by decide() itself)
 */

import { decide, hasGatewayCredentials } from '@vismay/ai-gateway';
import type { ResolvedEntity } from './entityResolver';

/**
 * Just the slice of `decide()` the gate actually uses. Narrower than the real
 * signature on purpose: the gate reads one field off each answer, so pinning
 * to the SDK's full result type would only force every test double to carry
 * usage, warnings and friends. The real `decide` satisfies this structurally.
 */
export type DecideFn = (options: {
  state: Record<string, string>;
  questions: Record<string, BooleanQuestion>;
  maxRetries?: number;
  metadata?: Record<string, string>;
}) => PromiseLike<{ answers: Record<string, { type: string; probability?: number }> }>;

/** A Jev boolean question, in the AI SDK's provider-agnostic spelling. */
type BooleanQuestion = {
  type: 'boolean';
  instructions: string;
  criteria: { true: string; false: string };
};

/** The article as the judge sees it. */
export type GateArticle = {
  headline: string;
  body: string;
  publisher: string;
};

/** A candidate with its verdict. `kept: false` means we drop the tag. */
export type GatedEntity = ResolvedEntity & {
  /** Probability the entity is a real subject of the article, 0–1. */
  confidence: number;
  kept: boolean;
};

export type GateOptions = {
  /** Injected by the tests. Keeping the seam at `decide()`, not at fetch,
   *  means the tests don't encode the gateway's wire format and survive a
   *  gateway upgrade. */
  decide?: DecideFn;
  /** Overrides JEV_ENTITY_MIN_CONFIDENCE. */
  minConfidence?: number;
};

/** Below this, the tag is dropped. Deliberately generous: the gate exists to
 *  cut confident passing mentions, not to second-guess borderline calls. */
const DEFAULT_MIN_CONFIDENCE = 0.55;

/** Jev answers every question in one request, but a 60-entity article would
 *  make one oversized call — chunk so each request stays predictable. */
const MAX_QUESTIONS_PER_REQUEST = 24;

/** A five-second judgement doesn't need the whole article, and the lede is
 *  where subject-vs-mention is decided. Claude still sees the full body. */
const MAX_BODY_CHARS = 8000;

/** Passed through to decide(), whose AI SDK call retries transient failures
 *  with exponential backoff. The fail-open path below catches whatever is
 *  still failing after that. */
const MAX_RETRIES = 2;

const TYPE_NOUN: Record<ResolvedEntity['type'], string> = {
  league: 'competition',
  team: 'club or national team',
  player: 'footballer',
};

/** The STEP 2 rubric from summarize.ts, restated as outcome criteria. A boolean
 *  question takes a description for each side, which is a better home for this
 *  than a paragraph buried in a system prompt. */
function questionFor(entity: ResolvedEntity): BooleanQuestion {
  return {
    type: 'boolean',
    instructions:
      `Is the ${TYPE_NOUN[entity.type]} "${entity.name}" a subject of this article, ` +
      `rather than something mentioned in passing?`,
    criteria: {
      true:
        `"${entity.name}" is the primary subject, or a substantive secondary subject ` +
        `the article actually discusses.`,
      false:
        `"${entity.name}" appears only in passing. Typical cases: it is quoted or ` +
        `reported as the source of the news rather than its subject; it appears ` +
        `parenthetically as a person's current or former club; it is background for ` +
        `a comparison with the real subject; it names a stadium or venue only; or it ` +
        `does not appear in the article text at all.`,
    },
  };
}

function resolveMinConfidence(override?: number): number {
  if (override !== undefined) return override;
  const raw = process.env.JEV_ENTITY_MIN_CONFIDENCE;
  if (!raw) return DEFAULT_MIN_CONFIDENCE;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    console.warn(
      `[jev-gate] ignoring JEV_ENTITY_MIN_CONFIDENCE=${raw} (want a number in 0..1); using ${DEFAULT_MIN_CONFIDENCE}`,
    );
    return DEFAULT_MIN_CONFIDENCE;
  }
  return parsed;
}

export function gateEnabled(): boolean {
  if (process.env.JEV_ENTITY_GATE === '0') return false;
  return hasGatewayCredentials();
}

let warnedDisabled = false;

/** Test seam — the one-time "disabled" log outlives a single run otherwise. */
export function resetJevGate(): void {
  warnedDisabled = false;
}

const keepAll = (candidates: ResolvedEntity[]): GatedEntity[] =>
  candidates.map((e) => ({ ...e, confidence: 1.0, kept: true }));

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Score each candidate. Never throws, never returns fewer entries than it was
 * given — callers can treat the result as the candidate list plus a verdict.
 */
export async function gateEntityTags(
  article: GateArticle,
  candidates: ResolvedEntity[],
  options: GateOptions = {},
): Promise<GatedEntity[]> {
  if (candidates.length === 0) return [];

  if (!options.decide && !gateEnabled()) {
    if (!warnedDisabled) {
      console.log(
        `[jev-gate] disabled (${process.env.JEV_ENTITY_GATE === '0' ? 'JEV_ENTITY_GATE=0' : 'no AI_GATEWAY_API_KEY'}) — tagging every resolved entity`,
      );
      warnedDisabled = true;
    }
    return keepAll(candidates);
  }

  const judge: DecideFn = options.decide ?? decide;

  const minConfidence = resolveMinConfidence(options.minConfidence);
  const state = {
    publisher: article.publisher,
    headline: article.headline,
    article: article.body.slice(0, MAX_BODY_CHARS),
  };

  const scored = new Map<string, number>();
  for (const batch of chunk(candidates, MAX_QUESTIONS_PER_REQUEST)) {
    // Positional keys, not entity ids: answers come back under the question
    // names, and `e0`-style names keep the request readable in gateway logs.
    const questions = Object.fromEntries(batch.map((e, i) => [`e${i}`, questionFor(e)]));

    try {
      const { answers } = await judge({
        state,
        questions,
        maxRetries: MAX_RETRIES,
        metadata: { feature: 'footshorts-entity-gate' },
      });
      batch.forEach((entity, i) => {
        const answer = answers[`e${i}`];
        if (answer?.type === 'boolean' && typeof answer.probability === 'number') {
          scored.set(entity.id, answer.probability);
        }
      });
    } catch (e: any) {
      // Fail open for this batch only — a rate limit on one chunk shouldn't
      // cost us the verdicts we already have.
      console.warn(
        `[jev-gate] judging failed for ${batch.length} candidate(s), keeping them: ${e?.message ?? e}`,
      );
    }
  }

  return candidates.map((entity) => {
    const confidence = scored.get(entity.id);
    // An unscored candidate (batch failed, or the answer went missing) is kept.
    if (confidence === undefined) return { ...entity, confidence: 1.0, kept: true };
    return { ...entity, confidence, kept: confidence >= minConfidence };
  });
}
