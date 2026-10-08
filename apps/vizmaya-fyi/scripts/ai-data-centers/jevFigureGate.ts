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
 * no prose. One boolean question per figure, a story's figures batched into
 * as few round trips as possible, and the probability lands in
 * `facts.figures[].confidence`.
 *
 * Calls go through `decide()` from @vismay/ai-gateway — the same Vercel AI
 * Gateway client the rest of the app runs on, so auth is shared
 * (AI_GATEWAY_API_KEY, or the OIDC token Vercel injects). Retries with
 * backoff and the overall timeout live there too. Same construction as the
 * footshorts worker's entity gate (apps/footshorts/worker/src/
 * jevEntityGate.ts).
 *
 * FAILS OPEN. No credentials, a 5xx, a timeout — every figure is kept with
 * confidence null, exactly as before this file existed. A judge being down
 * must not empty the figures the whole edition draws from.
 *
 * Env:
 *   AI_GATEWAY_API_KEY           — the shared gateway key
 *   JEV_FIGURE_GATE=0            — kill switch, leaves credentials in place
 *   JEV_FIGURE_MIN_CONFIDENCE    — keep threshold, default 0.5
 *   JEV_MODEL                    — decision model id, default `typesafe-ai/jev`
 *                                  (read by decide() itself)
 *   AI_GATEWAY_DECIDE_TIMEOUT_MS — overall budget per request incl. retries,
 *                                  default 30000 (read by decide() itself)
 */

import { decide, hasGatewayCredentials } from '@vismay/ai-gateway'
import type { DcStoryFigure } from '@vismay/dc-editions/dcEditionTypes'

type BooleanQuestion = {
  type: 'boolean'
  instructions: string
  criteria: { true: string; false: string }
}

/**
 * The slice of `decide()` the gate uses (test seam). Narrower than the real
 * signature on purpose so a test double only has to return `answers`; the
 * real `decide` satisfies it structurally.
 */
export type DecideFn = (options: {
  state: Record<string, string>
  questions: Record<string, BooleanQuestion>
  maxRetries?: number
  metadata?: Record<string, string>
}) => PromiseLike<{ answers: Record<string, { type: string; probability?: number }> }>

export type GateStory = {
  headline: string
  summary: string | null
  outlet: string | null
}

export type GatedFigure = DcStoryFigure & { kept: boolean }

export type FigureGateOptions = {
  /** Injected by tests — a network-free stand-in for `decide()`. */
  decide?: DecideFn
  minConfidence?: number
}

/**
 * Deliberately generous: the gate exists to cut confident mis-tags and
 * numbers the story never states, not to second-guess borderline calls.
 */
const DEFAULT_MIN_CONFIDENCE = 0.5
/** Keep each decide() call to a couple of dozen questions. */
const MAX_QUESTIONS_PER_REQUEST = 24
/** Passed through to decide(), whose AI SDK call retries with backoff. */
const MAX_RETRIES = 2

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

export function figureGateEnabled(): boolean {
  if (process.env.JEV_FIGURE_GATE === '0') return false
  return hasGatewayCredentials()
}

let warnedDisabled = false

const keepAll = (figures: DcStoryFigure[]): GatedFigure[] => figures.map((f) => ({ ...f, kept: true }))

/**
 * Score a story's figures. Never throws, never returns fewer entries than it
 * was given — callers filter on `kept` and keep `confidence` on the rest.
 */
export async function gateFigures(story: GateStory, figures: DcStoryFigure[], options: FigureGateOptions = {}): Promise<GatedFigure[]> {
  if (figures.length === 0) return []
  if (!options.decide && !figureGateEnabled()) {
    if (!warnedDisabled) {
      console.log(
        `[jev-figures] disabled (${process.env.JEV_FIGURE_GATE === '0' ? 'JEV_FIGURE_GATE=0' : 'no AI_GATEWAY_API_KEY'}) — keeping every extracted figure`,
      )
      warnedDisabled = true
    }
    return keepAll(figures)
  }
  const judge: DecideFn = options.decide ?? decide
  const minConfidence = resolveMinConfidence(options.minConfidence)

  const state = {
    headline: story.headline,
    summary: story.summary ?? '(no summary available)',
    outlet: story.outlet ?? 'unknown',
  }

  const scored = new Map<number, number>()
  for (let start = 0; start < figures.length; start += MAX_QUESTIONS_PER_REQUEST) {
    const batch = figures.slice(start, start + MAX_QUESTIONS_PER_REQUEST)
    const questions: Record<string, BooleanQuestion> = {}
    batch.forEach((f, i) => {
      questions[`fig_${start + i}`] = questionFor(f)
    })
    try {
      const { answers } = await judge({
        state,
        questions,
        maxRetries: MAX_RETRIES,
        metadata: { feature: 'dc-figure-gate' },
      })
      batch.forEach((_, i) => {
        const p = answers[`fig_${start + i}`]?.probability
        if (typeof p === 'number' && Number.isFinite(p)) scored.set(start + i, p)
      })
    } catch (e) {
      // Fail open for this batch only — verdicts from other batches stand.
      console.warn(`[jev-figures] judge failed, keeping ${batch.length} figure(s): ${e instanceof Error ? e.message : e}`)
    }
  }

  return figures.map((f, i) => {
    const p = scored.get(i)
    if (p === undefined) return { ...f, kept: true }
    const confidence = Math.round(p * 1000) / 1000
    return { ...f, confidence, kept: confidence >= minConfidence }
  })
}

/** Test seam — the one-time "disabled" log outlives a single run otherwise. */
export function clearFigureJudgeCache(): void {
  warnedDisabled = false
}
