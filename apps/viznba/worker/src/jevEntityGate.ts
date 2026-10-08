/**
 * Jev entity-tag precision gate — the VizNBA port of
 * apps/footshorts/worker/src/jevEntityGate.ts (read that file for the full
 * rationale).
 *
 * Claude extracts names (summarise.ts STEP 2) and entityResolver maps them to
 * canonical rows. Whether a named player is what the article is ABOUT is a
 * separate yes/no judgement, so we ask Jev per candidate, batched into one
 * round trip. The probability lands in viznba_article_entities.confidence
 * and candidates below the threshold are dropped. Recall stays with Claude
 * and the resolver: this gate only ever removes tags.
 *
 * FAILS OPEN — no credentials, a 5xx or a timeout keeps every candidate at
 * confidence 1.0. A judge being down must not empty the tag graph.
 *
 * Env:
 *   JEV_ENTITY_GATE=0          — kill switch
 *   JEV_ENTITY_MIN_CONFIDENCE  — keep threshold, default 0.55
 */

import { decide, hasGatewayCredentials } from '@vismay/ai-gateway'
import type { EntityType, ResolvedEntity } from './entityResolver'

type BooleanQuestion = {
  type: 'boolean'
  instructions: string
  criteria: { true: string; false: string }
}

/** The slice of `decide()` the gate uses — the test seam. */
export type DecideFn = (options: {
  state: Record<string, string>
  questions: Record<string, BooleanQuestion>
  maxRetries?: number
  metadata?: Record<string, string>
}) => PromiseLike<{ answers: Record<string, { type: string; probability?: number }> }>

export type GateArticle = { headline: string; body: string; publisher: string }

export type GatedEntity = ResolvedEntity & { confidence: number; kept: boolean }

const DEFAULT_MIN_CONFIDENCE = 0.55
const MAX_QUESTIONS_PER_REQUEST = 24
const MAX_BODY_CHARS = 8000
const MAX_RETRIES = 2

const TYPE_NOUN: Record<EntityType, string> = {
  team: 'NBA team',
  player: 'player',
  coach: 'coach',
}

function questionFor(entity: ResolvedEntity): BooleanQuestion {
  return {
    type: 'boolean',
    instructions:
      `Is the ${TYPE_NOUN[entity.type]} "${entity.name}" a subject of this article, ` +
      `rather than something mentioned in passing?`,
    criteria: {
      true:
        `"${entity.name}" is the primary subject, or a substantive secondary subject the ` +
        `article actually discusses — including every team and player that moves in a trade.`,
      false:
        `"${entity.name}" appears only in passing. Typical cases: it is quoted or reported as ` +
        `the source of the news rather than its subject; it appears parenthetically as a ` +
        `player's current or former team; it is background for a comparison with the real ` +
        `subject; it is only an opponent named in a schedule or box-score line; or it does not ` +
        `appear in the article text at all.`,
    },
  }
}

function resolveMinConfidence(override?: number): number {
  if (override !== undefined) return override
  const raw = process.env.JEV_ENTITY_MIN_CONFIDENCE
  if (!raw) return DEFAULT_MIN_CONFIDENCE
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    console.warn(`[jev-gate] ignoring JEV_ENTITY_MIN_CONFIDENCE=${raw}; using ${DEFAULT_MIN_CONFIDENCE}`)
    return DEFAULT_MIN_CONFIDENCE
  }
  return parsed
}

export function gateEnabled(): boolean {
  return process.env.JEV_ENTITY_GATE !== '0' && hasGatewayCredentials()
}

let warnedDisabled = false

const keepAll = (candidates: ResolvedEntity[]): GatedEntity[] =>
  candidates.map((e) => ({ ...e, confidence: 1.0, kept: true }))

/** Score each candidate. Never throws, never returns fewer entries than given. */
export async function gateEntityTags(
  article: GateArticle,
  candidates: ResolvedEntity[],
  options: { decide?: DecideFn; minConfidence?: number } = {},
): Promise<GatedEntity[]> {
  if (candidates.length === 0) return []

  if (!options.decide && !gateEnabled()) {
    if (!warnedDisabled) {
      console.log('[jev-gate] disabled — tagging every resolved entity')
      warnedDisabled = true
    }
    return keepAll(candidates)
  }

  const judge: DecideFn = options.decide ?? decide
  const minConfidence = resolveMinConfidence(options.minConfidence)
  const state = {
    publisher: article.publisher,
    headline: article.headline,
    article: article.body.slice(0, MAX_BODY_CHARS),
  }

  const scored = new Map<string, number>()
  for (let i = 0; i < candidates.length; i += MAX_QUESTIONS_PER_REQUEST) {
    const batch = candidates.slice(i, i + MAX_QUESTIONS_PER_REQUEST)
    const questions = Object.fromEntries(batch.map((e, j) => [`e${j}`, questionFor(e)]))
    try {
      const { answers } = await judge({
        state,
        questions,
        maxRetries: MAX_RETRIES,
        metadata: { feature: 'viznba-entity-gate' },
      })
      batch.forEach((entity, j) => {
        const answer = answers[`e${j}`]
        if (answer?.type === 'boolean' && typeof answer.probability === 'number') {
          scored.set(`${entity.type}:${entity.id}`, answer.probability)
        }
      })
    } catch (e) {
      console.warn(
        `[jev-gate] judging failed for ${batch.length} candidate(s), keeping them: ${e instanceof Error ? e.message : e}`,
      )
    }
  }

  return candidates.map((entity) => {
    const confidence = scored.get(`${entity.type}:${entity.id}`)
    if (confidence === undefined) return { ...entity, confidence: 1.0, kept: true }
    return { ...entity, confidence, kept: confidence >= minConfidence }
  })
}
