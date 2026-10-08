import {
  experimental_decide as aiDecide,
  type Experimental_DecisionQuestion,
  type Experimental_DecisionResult,
  type Experimental_DecisionState,
} from 'ai'
import { getGatewayClient } from './client'
import { resolveModel, type DecisionModelAlias } from './models'

/**
 * Typed decisions via Jev (`typesafe-ai/jev`).
 *
 * Jev is a System One model: state plus named questions in, a calibrated
 * answer per question out, no prose. Three question shapes:
 *
 *   - boolean — `{ type: 'boolean', instructions, criteria: { true, false } }`
 *               → `{ probability }`, the model's P(true) in [0, 1]
 *   - choice  — `{ type: 'choice', instructions, criteria: { optionA: desc, … } }`
 *               → `{ choice, probabilities? }`
 *   - score   — `{ type: 'score', instructions, criteria: [level0, level1, …] }`
 *               → `{ score, probabilities? }`, fractional level index
 *
 * Use it wherever the job is to DECIDE something about content that already
 * exists — is this football news, which topic bucket, is this tag a real
 * subject, are these two names the same entity. Anything that has to WRITE
 * text or produce a free-form list (summaries, extraction, narratives) stays
 * on a Claude text tier via `generateText`.
 *
 * All questions in one call share the same `state` and are answered in a
 * single round trip. Keep a call to a couple of dozen questions; callers with
 * more should batch.
 *
 * Throws on transport failure, timeout, or a refusal. Callers whose decision
 * gates content (drop a tag, hide an article) should decide for themselves
 * whether to fail open or closed — this helper doesn't guess.
 */

export type DecisionQuestion = Experimental_DecisionQuestion
export type DecisionState = Experimental_DecisionState

export interface DecideOptions<Q extends Record<string, DecisionQuestion>> {
  /** Alias from MODELS.decision or a raw gateway id. Default `decision.jev`. */
  model?: DecisionModelAlias | string
  /** What the questions are about — a string, a JSON object, or content parts. */
  state: DecisionState
  /** Named questions; answers come back under the same names. */
  questions: Q
  /** Overall budget across retries, ms. Default AI_GATEWAY_DECIDE_TIMEOUT_MS or 30s. */
  timeoutMs?: number
  /** Retries on transient provider failures. Default 2. */
  maxRetries?: number
  /** Forwarded to the gateway as headers — useful for tagging spend by feature. */
  metadata?: Record<string, string>
}

export interface DecideResult<Q extends Record<string, DecisionQuestion>> {
  answers: Experimental_DecisionResult<Q>['answers']
  /** Concrete model id the request was sent to. */
  modelUsed: string
}

const DEFAULT_TIMEOUT_MS = Number(process.env.AI_GATEWAY_DECIDE_TIMEOUT_MS) || 30_000

/**
 * Ask Jev a set of typed questions about one piece of state.
 *
 * `JEV_MODEL` overrides the default model id for every call that doesn't pass
 * an explicit `model` — handy for pinning a Jev revision in one place.
 */
export async function decide<const Q extends Record<string, DecisionQuestion>>(
  opts: DecideOptions<Q>,
): Promise<DecideResult<Q>> {
  const modelId = resolveModel(opts.model ?? (process.env.JEV_MODEL || 'decision.jev'))
  const res = await aiDecide({
    model: getGatewayClient().decisionModel(modelId),
    state: opts.state,
    questions: opts.questions,
    maxRetries: opts.maxRetries ?? 2,
    abortSignal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    headers: opts.metadata,
  })
  return { answers: res.answers, modelUsed: modelId }
}

/**
 * True when this process can reach the gateway: an explicit AI_GATEWAY_API_KEY,
 * or the OIDC token the Vercel runtime injects. Callers with an optional
 * decision step (precision gates) use this to skip it cleanly offline.
 */
export function hasGatewayCredentials(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN)
}
