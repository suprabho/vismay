/**
 * Jev figure precision gate.
 *
 * Haiku extracts the figures a story states (scrape-news.ts) and, since
 * classifier v3, tags each with a subject, a scope and a status — the tags
 * that decide which figures may share a scale on the edition's charts.
 * Extraction is the part Haiku is good at; deciding whether "20 GW" really
 * is a *target* for a *market* rather than committed capacity at a site is a
 * different job, and a wrong tag puts a target and a site on one rail.
 *
 * So we re-ask, per figure, as a typed yes/no. Jev is a System One model:
 * state plus named questions in, a calibrated probability per question out,
 * no prose. One boolean question per figure, all of a story's figures in one
 * round trip, and the probability lands in `facts.figures[].confidence`.
 *
 * Routed through Vercel AI Gateway, which lists Jev as an evaluation model
 * (`typesafe-ai/jev`), so this reuses AI_GATEWAY_API_KEY. Same construction
 * as the footshorts worker's entity gate (apps/footshorts/worker/src/
 * jevEntityGate.ts): the shared @vismay/ai-gateway pins @ai-sdk/gateway ^2 and
 * evaluation models only exist from v4, so this app takes its own ^4 for the
 * one call. Fold into @vismay/ai-gateway when that package moves to v4.
 *
 * FAILS OPEN. No credentials, a 5xx, a timeout — every figure is kept with
 * confidence null, exactly as before this file existed. A judge being down
 * must not empty the figures the whole edition draws from.
 *
 * Env:
 *   AI_GATEWAY_API_KEY        — the shared gateway key
 *   JEV_FIGURE_GATE=0         — kill switch, leaves credentials in place
 *   JEV_FIGURE_MIN_CONFIDENCE — keep threshold, default 0.5
 *   JEV_MODEL                 — gateway model id, default `typesafe-ai/jev`
 *   AI_GATEWAY_TIMEOUT_MS     — per-attempt timeout, default 15000
 */

import { createGateway } from '@ai-sdk/gateway'
import type { DcStoryFigure } from '@vismay/content-source/dcEditionTypes'

type BooleanQuestion = {
  type: 'boolean'
  instructions: string
  criteria: { true: string; false: string }
}

/** The slice of an AI SDK evaluation model the gate uses (test seam). */
export type FigureJudge = {
  doEvaluate(options: {
    state: Record<string, string>
    questions: Record<string, BooleanQuestion>
    abortSignal?: AbortSignal
  }): PromiseLike<{ answers: Record<string, { type: string; probability?: number }> }>
}

export type GateStory = {
  headline: string
  summary: string | null
  outlet: string | null
}

export type GatedFigure = DcStoryFigure & { kept: boolean }

export type FigureGateOptions = {
  model?: FigureJudge
  minConfidence?: number
}

/**
 * Deliberately generous: the gate exists to cut confident mis-tags and
 * numbers the story never states, not to second-guess borderline calls.
 */
const DEFAULT_MIN_CONFIDENCE = 0.5
const DEFAULT_MODEL_ID = 'typesafe-ai/jev'
const TIMEOUT_MS = Number(process.env.AI_GATEWAY_TIMEOUT_MS) || 15_000
const MAX_RETRIES = 2
const BACKOFF_INITIAL_MS = 500
const BACKOFF_MAX_MS = 5_000

const SCOPE_WORDS: Record<string, string> = {
  site: 'one site, campus or facility',
  company: 'one company or operator as a whole',
  market: 'a market, industry, country or global total',
  policy: 'a policy, rule, programme or public budget',
}

const STATUS_WORDS: Record<string, string> = {
  committed: 'committed — signed, built, spent, let or contracted',
  target: 'a target or announced goal that is not yet committed',
  forecast: 'a forecast, projection or analyst estimate',
  queued: 'queued — a pipeline, application or waiting list, not yet granted',
  stated: 'simply stated, none of the above',
}

function questionFor(f: DcStoryFigure): BooleanQuestion {
  const what = `${f.value} ${f.unit}`.trim()
  const subject = f.subject ? ` for "${f.subject}"` : ''
  const scope = f.scope ? SCOPE_WORDS[f.scope] : null
  const status = f.status ? STATUS_WORDS[f.status] : null
  const tags = [scope && `describes ${scope}`, status && `is ${status}`].filter(Boolean).join(' and ')
  return {
    type: 'boolean',
    instructions:
      `Does the story literally state the figure ${what} ("${f.label}")${subject}` +
      (tags ? `, and is it right that the figure ${tags}?` : '?'),
    criteria: {
      true:
        `The number ${what} appears in the headline or summary as a quantity the story reports` +
        (tags ? `, and the tags fit: it ${tags}.` : '.'),
      false:
        `The number does not appear in the text, is an estimate the story never states, is a different quantity ` +
        `than the label says, or the tags are wrong — for example a target described as committed, ` +
        `a global total described as one site, or a grid-queue figure described as capacity that was built.`,
    },
  }
}

function resolveMinConfidence(override?: number): number {
  if (override !== undefined) return override
  const raw = process.env.JEV_FIGURE_MIN_CONFIDENCE
  if (!raw) return DEFAULT_MIN_CONFIDENCE
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    console.warn(`[jev-figures] ignoring JEV_FIGURE_MIN_CONFIDENCE=${raw} (want 0..1); using ${DEFAULT_MIN_CONFIDENCE}`)
    return DEFAULT_MIN_CONFIDENCE
  }
  return n
}

function hasGatewayCredentials(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN)
}

export function figureGateEnabled(): boolean {
  if (process.env.JEV_FIGURE_GATE === '0') return false
  return hasGatewayCredentials()
}

let cachedModel: FigureJudge | null = null
let warnedDisabled = false

function getModel(): FigureJudge | null {
  if (cachedModel) return cachedModel
  try {
    const apiKey = process.env.AI_GATEWAY_API_KEY
    const gateway = createGateway({ ...(apiKey ? { apiKey } : {}) })
    cachedModel = gateway.evaluationModel(process.env.JEV_MODEL || DEFAULT_MODEL_ID)
    return cachedModel
  } catch (e) {
    console.warn(`[jev-figures] gateway unavailable, keeping all figures: ${e instanceof Error ? e.message : e}`)
    return null
  }
}

const keepAll = (figures: DcStoryFigure[]): GatedFigure[] => figures.map((f) => ({ ...f, kept: true }))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function evaluateWithRetries(
  model: FigureJudge,
  state: Record<string, string>,
  questions: Record<string, BooleanQuestion>,
): Promise<Record<string, { type: string; probability?: number }>> {
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(Math.min(BACKOFF_INITIAL_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS))
    try {
      const result = await model.doEvaluate({ state, questions, abortSignal: AbortSignal.timeout(TIMEOUT_MS) })
      return result.answers
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

/**
 * Score a story's figures. Never throws, never returns fewer entries than it
 * was given — callers filter on `kept` and keep `confidence` on the rest.
 */
export async function gateFigures(story: GateStory, figures: DcStoryFigure[], options: FigureGateOptions = {}): Promise<GatedFigure[]> {
  if (figures.length === 0) return []
  if (!options.model && !figureGateEnabled()) {
    if (!warnedDisabled) {
      console.log('[jev-figures] disabled (no AI_GATEWAY_API_KEY) — keeping every extracted figure')
      warnedDisabled = true
    }
    return keepAll(figures)
  }
  const model = options.model ?? getModel()
  if (!model) return keepAll(figures)
  const minConfidence = resolveMinConfidence(options.minConfidence)

  const state = {
    headline: story.headline,
    summary: story.summary ?? '(no summary available)',
    outlet: story.outlet ?? 'unknown',
  }
  const questions: Record<string, BooleanQuestion> = {}
  figures.forEach((f, i) => {
    questions[`fig_${i}`] = questionFor(f)
  })

  try {
    const answers = await evaluateWithRetries(model, state, questions)
    return figures.map((f, i) => {
      const p = answers[`fig_${i}`]?.probability
      if (typeof p !== 'number' || !Number.isFinite(p)) return { ...f, kept: true }
      const confidence = Math.round(p * 1000) / 1000
      return { ...f, confidence, kept: confidence >= minConfidence }
    })
  } catch (e) {
    console.warn(`[jev-figures] judge failed, keeping all figures: ${e instanceof Error ? e.message : e}`)
    return keepAll(figures)
  }
}

/** Test seam — the cache above outlives a single run otherwise. */
export function clearFigureJudgeCache(): void {
  cachedModel = null
  warnedDisabled = false
}
