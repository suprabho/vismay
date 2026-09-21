/**
 * Jev entity-tag precision gate.
 *
 * Gemini extracts entity names (gemini.ts STEP 3) and entityResolver maps them
 * to canonical rows. Extraction is the part Gemini is good at; deciding whether
 * a named club is actually what the article is ABOUT is a different job, and
 * it's the one the eval keeps scoring as SPURIOUS — the four failure patterns
 * spelled out in gemini.ts's STEP 3 ("X confirmed Y did Z", parenthetical
 * clubs, comparison context, stadium-as-venue) are all passing mentions that
 * survive extraction.
 *
 * So we re-ask, per candidate, as a typed yes/no. Jev is a System One model:
 * state plus named questions in, a calibrated probability per question out, no
 * prose. One boolean question per candidate, all of them batched into a single
 * round trip, and the probability lands in `article_entities.confidence` — a
 * column that has existed since the init migration ("Gemini can return
 * confidence") and has never been written to.
 *
 * Routed through Vercel AI Gateway, which lists Jev as a first-class
 * evaluation model (`typesafe-ai/jev`), so this reuses AI_GATEWAY_API_KEY —
 * the key admin and story-pipeline already run on — instead of provisioning a
 * separate TypeSafe key. Auth matches packages/ai-gateway/src/client.ts: an
 * explicit key locally, or the OIDC token Vercel injects at deploy time.
 *
 * NOTE ON THE DEPENDENCY: the shared @vismay/ai-gateway package pins
 * @ai-sdk/gateway ^2 / ai ^5, and evaluation models only exist from gateway v4
 * (ai v7). Rather than force that upgrade on admin + story-pipeline for one
 * call, the worker takes its own @ai-sdk/gateway ^4 and builds a client here.
 * Fold this into @vismay/ai-gateway when that package moves to v4 — the
 * evaluation surface is the only thing this file needs from it.
 *
 * Why this shape and not "let Jev do the tagging": Jev only answers
 * boolean/choice/score questions. It cannot emit a free-text list of entities,
 * so it can't replace extraction — it can only judge candidates that already
 * exist. Recall still belongs entirely to Gemini and the resolver; this gate
 * only ever removes tags, never adds them.
 *
 * FAILS OPEN. No gateway credentials, a 5xx, a timeout — every candidate is
 * kept at confidence 1.0, exactly as before this file existed. A third-party
 * judge being down must not silently empty the follow graph that the story
 * rings (web/lib/useFollowedStories.ts) are built from.
 *
 * Env:
 *   AI_GATEWAY_API_KEY        — the shared gateway key; on Vercel the injected
 *                               OIDC token stands in for it
 *   JEV_ENTITY_GATE=0         — kill switch, leaves credentials in place
 *   JEV_ENTITY_MIN_CONFIDENCE — keep threshold, default 0.55
 *   JEV_MODEL                 — gateway model id, default `typesafe-ai/jev`
 *   AI_GATEWAY_TIMEOUT_MS     — per-attempt timeout, default 15000
 */

import { createGateway } from '@ai-sdk/gateway';
import type { ResolvedEntity } from './entityResolver';

/**
 * Just the slice of an AI SDK evaluation model the gate actually uses.
 * Narrower than `Experimental_EvaluationModelV4` on purpose: the gate reads
 * one field off each answer, so pinning to the SDK's full result type would
 * only force every test double to carry `warnings`, `rounding` and friends,
 * and would break them on an SDK shape change the gate doesn't care about.
 * The real gateway model satisfies this structurally.
 */
export type EntityJudge = {
  doEvaluate(options: {
    state: Record<string, string>;
    questions: Record<string, BooleanQuestion>;
    abortSignal?: AbortSignal;
  }): PromiseLike<{ answers: Record<string, { type: string; probability?: number }> }>;
};

/** A Jev noul, in the AI SDK's provider-agnostic spelling. */
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
  /** Injected by the tests. Keeping the seam at the model, not at fetch,
   *  means the tests don't encode the gateway's wire format and survive a
   *  gateway upgrade. */
  model?: EntityJudge;
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
 *  where subject-vs-mention is decided. Gemini still sees the full body. */
const MAX_BODY_CHARS = 8000;

const DEFAULT_MODEL_ID = 'typesafe-ai/jev';
const TIMEOUT_MS = Number(process.env.AI_GATEWAY_TIMEOUT_MS) || 15_000;

/** doEvaluate is a single call with no retry of its own (unlike `ai`'s
 *  generateText wrapper), so the gate does its own — same defaults the
 *  TypeSafe SDK used, since the failure modes are identical. */
const MAX_RETRIES = 2;
const BACKOFF_INITIAL_MS = 500;
const BACKOFF_MAX_MS = 5_000;

const TYPE_NOUN: Record<ResolvedEntity['type'], string> = {
  league: 'competition',
  team: 'club or national team',
  player: 'footballer',
};

/** The STEP 3 rubric from gemini.ts, restated as outcome criteria. A boolean
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

/** Same auth story as packages/ai-gateway/src/client.ts: an explicit key, or
 *  the OIDC token the Vercel runtime injects. Either one means we can call. */
function hasGatewayCredentials(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

export function gateEnabled(): boolean {
  if (process.env.JEV_ENTITY_GATE === '0') return false;
  return hasGatewayCredentials();
}

// Built once per worker run, like the entity caches.
let cachedModel: EntityJudge | null = null;
let warnedDisabled = false;

function getModel(): EntityJudge | null {
  if (cachedModel) return cachedModel;
  try {
    const apiKey = process.env.AI_GATEWAY_API_KEY;
    const gateway = createGateway({ ...(apiKey ? { apiKey } : {}) });
    cachedModel = gateway.evaluationModel(process.env.JEV_MODEL || DEFAULT_MODEL_ID);
    return cachedModel;
  } catch (e: any) {
    console.warn(`[jev-gate] gateway unavailable, keeping all tags: ${e?.message ?? e}`);
    return null;
  }
}

/** Test seam — the cache above outlives a single run otherwise. */
export function clearJevClientCache(): void {
  cachedModel = null;
  warnedDisabled = false;
}

const keepAll = (candidates: ResolvedEntity[]): GatedEntity[] =>
  candidates.map((e) => ({ ...e, confidence: 1.0, kept: true }));

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry on anything transient. We can't reliably read a status code off an
 *  AI SDK error here, and the call is idempotent and cheap, so retry every
 *  failure rather than trying to classify it — the fail-open path below is
 *  what catches a genuinely broken gateway. */
async function evaluateWithRetries(
  model: EntityJudge,
  state: Record<string, string>,
  questions: Record<string, BooleanQuestion>,
): Promise<Record<string, { type: string; probability?: number }>> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(Math.min(BACKOFF_INITIAL_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS));
    }
    try {
      const result = await model.doEvaluate({
        state,
        questions,
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return result.answers;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
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

  if (!options.model && !gateEnabled()) {
    if (!warnedDisabled) {
      console.log(
        '[jev-gate] disabled (no AI_GATEWAY_API_KEY) — tagging every resolved entity',
      );
      warnedDisabled = true;
    }
    return keepAll(candidates);
  }

  const model = options.model ?? getModel();
  if (!model) return keepAll(candidates);

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
      const answers = await evaluateWithRetries(model, state, questions);
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
