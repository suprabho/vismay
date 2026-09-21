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
 * So we re-ask, per candidate, as a typed yes/no: TypeSafe's Jev is a System
 * One model — you hand it state plus named questions and it answers each with
 * a calibrated probability, no prose. One `noul` per candidate, all of them
 * batched into a single round trip, and the probability lands in
 * `article_entities.confidence` — a column that has existed since the init
 * migration ("Gemini can return confidence") and has never been written to.
 *
 * Why this shape and not "let Jev do the tagging": Jev only answers noul /
 * choice / score questions. It cannot emit a free-text list of entities, so it
 * can't replace extraction — it can only judge candidates that already exist.
 * Recall still belongs entirely to Gemini and the resolver; this gate only
 * ever removes tags, never adds them.
 *
 * FAILS OPEN. No API key, a 5xx, a timeout — every candidate is kept at
 * confidence 1.0, exactly as before this file existed. A third-party judge
 * being down must not silently empty the follow graph that the story rings
 * (web/lib/useFollowedStories.ts) are built from.
 *
 * Env:
 *   TYPESAFE_API_KEY          — required to enable the gate; absent = disabled
 *   JEV_ENTITY_GATE=0         — kill switch, leaves the key in place
 *   JEV_ENTITY_MIN_CONFIDENCE — keep threshold, default 0.55
 *   TYPESAFE_DEFAULT_MODEL    — default `jev-latest` (SDK default)
 */

import { TypeSafeClient, noul, type Fetch } from '@typesafe-ai/sdk';
import type { ResolvedEntity } from './entityResolver';

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
  /** Injected for tests; defaults to the SDK's own fetch. */
  fetch?: Fetch;
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

const TYPE_NOUN: Record<ResolvedEntity['type'], string> = {
  league: 'competition',
  team: 'club or national team',
  player: 'footballer',
};

/** The STEP 3 rubric from gemini.ts, restated as outcome criteria. Jev takes
 *  descriptions for each side of a noul, which is a better home for this than
 *  a paragraph buried in a system prompt. */
function questionFor(entity: ResolvedEntity) {
  return noul(
    `Is the ${TYPE_NOUN[entity.type]} "${entity.name}" a subject of this article, ` +
      `rather than something mentioned in passing?`,
    {
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
  );
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
  return Boolean(process.env.TYPESAFE_API_KEY);
}

// Built once per worker run, like the entity caches.
let client: TypeSafeClient | null = null;
let clientFetch: Fetch | undefined;
let warnedDisabled = false;

function getClient(fetchImpl?: Fetch): TypeSafeClient | null {
  if (client && clientFetch === fetchImpl) return client;
  try {
    client = new TypeSafeClient({
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
      // One judgement per article shouldn't hold up a batch of hundreds.
      timeout: 15_000,
    });
    clientFetch = fetchImpl;
    return client;
  } catch (e: any) {
    console.warn(`[jev-gate] client unavailable, keeping all tags: ${e?.message ?? e}`);
    return null;
  }
}

/** Test seam — the caches above outlive a single run otherwise. */
export function clearJevClientCache(): void {
  client = null;
  clientFetch = undefined;
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

  if (!gateEnabled()) {
    if (!warnedDisabled) {
      console.log('[jev-gate] disabled (no TYPESAFE_API_KEY) — tagging every resolved entity');
      warnedDisabled = true;
    }
    return keepAll(candidates);
  }

  const typesafe = getClient(options.fetch);
  if (!typesafe) return keepAll(candidates);

  const minConfidence = resolveMinConfidence(options.minConfidence);
  const state = {
    publisher: article.publisher,
    headline: article.headline,
    article: article.body.slice(0, MAX_BODY_CHARS),
  };

  const scored = new Map<string, number>();
  for (const batch of chunk(candidates, MAX_QUESTIONS_PER_REQUEST)) {
    // Positional keys, not entity ids: the answer map is keyed by question
    // name, and `e0`-style names keep the request readable in Jev's logs.
    const questions = Object.fromEntries(batch.map((e, i) => [`e${i}`, questionFor(e)]));

    try {
      const { answers } = await typesafe.systemOne({ state, questions });
      batch.forEach((entity, i) => {
        const answer = answers[`e${i}`];
        if (answer?.type === 'noul') scored.set(entity.id, answer.noul);
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
