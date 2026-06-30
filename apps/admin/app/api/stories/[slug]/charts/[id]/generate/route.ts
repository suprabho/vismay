import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'
import { hashRequest, recordGeneration } from '@vismay/ai-gateway'
import { getContentSource } from '@vismay/content-source/contentSource'
import { listStorySources } from '@vismay/content-source/storySources'
import { readComposeState } from '@vismay/content-source/composeState'
import {
  generateChart,
  buildChartData,
  type ChartRequirement,
  type ChartType,
  type ResearchBrief,
  type StoryFormat,
} from '@vismay/story-pipeline'
import { getFeatureModel } from '@/lib/aiModelSettings'
import { sourcesToDocs } from '../../../canvas/compose/shared'

/**
 * Generate (or regenerate) ONE chart's DATA, grounded in the story's sources.
 *
 * Thin adapter over `@vismay/story-pipeline`'s `generateChart`: the engine owns
 * the prompt + the data schema (categories + numeric series); the route adds the
 * admin concerns (auth, per-feature model, audit row) and resolves the chart
 * REQUIREMENT to feed it.
 *
 * The requirement comes from the compose outline (`storyOutline.charts`) when
 * the story is a compose draft; otherwise the caller (the canvas chart editor)
 * supplies a `requirement` string in the body so charts on non-compose stories
 * can still be generated. Nothing is written here — the editor previews the
 * returned `option`/`spec` and persists via the chart PUT route.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const SAFE_ID = /^[a-zA-Z0-9_-]+$/
const MAX_REQUIREMENT_LENGTH = 2000
const MAX_FEEDBACK_LENGTH = 2000

interface StoredBrief {
  summary?: string
  keyFacts?: string[]
  entities?: string[]
  suggestedFormat?: StoryFormat
}

interface Body {
  /** Override/supply the chart requirement (required when there's no compose draft). */
  requirement?: string
  chartType?: ChartType
  title?: string
  /** Refine loop: the author's note on what to change about the current data. */
  feedback?: string
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug, id } = await params
  if (!SAFE_ID.test(slug) || !SAFE_ID.test(id)) {
    return NextResponse.json({ error: 'bad slug or id' }, { status: 400 })
  }

  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    // empty body is fine
  }

  const state = await readComposeState(slug)
  const sb = (state?.brief ?? {}) as StoredBrief
  const outlineCharts =
    ((state?.storyOutline as { charts?: ChartRequirement[] } | undefined)?.charts) ?? []
  const planned = outlineCharts.find((c) => c.id === id)

  // Resolve the requirement: caller override → compose outline → error.
  const overrideReq =
    typeof body.requirement === 'string' ? body.requirement.trim().slice(0, MAX_REQUIREMENT_LENGTH) : ''
  const requirement: ChartRequirement | null = overrideReq
    ? {
        id,
        chartType: body.chartType ?? planned?.chartType ?? 'Bar Chart',
        title: body.title ?? planned?.title,
        requirement: overrideReq,
        xLabel: planned?.xLabel,
        yLabel: planned?.yLabel,
      }
    : (planned ?? null)
  if (!requirement) {
    return NextResponse.json(
      { error: 'no chart requirement — pass "requirement" or generate from a compose draft' },
      { status: 422 },
    )
  }

  const docs = sourcesToDocs(await listStorySources(slug))
  if (docs.length === 0) {
    return NextResponse.json({ error: 'no extracted sources to ground the chart' }, { status: 422 })
  }

  const brief: ResearchBrief = {
    summary: sb.summary ?? '',
    keyFacts: sb.keyFacts ?? [],
    entities: sb.entities ?? [],
    suggestedFormat: sb.suggestedFormat ?? state?.format ?? 'deck',
    candidateAngles: [],
    questions: [],
  }

  const feedback =
    typeof body.feedback === 'string' ? body.feedback.trim().slice(0, MAX_FEEDBACK_LENGTH) : ''
  // On a refine, ground the model in the chart's current data.
  let previous: unknown = null
  if (feedback) {
    previous = await getContentSource()
      .readChart(slug, id)
      .catch(() => null)
  }
  const refine = feedback && previous ? { feedback, previous } : undefined

  const model = await getFeatureModel('generateChart')

  let spec
  try {
    spec = await generateChart({ requirement, brief, sources: docs }, { model, refine })
  } catch (e) {
    return NextResponse.json(
      { error: `chart generation failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }
  // The chart_data contract the renderer consumes is `{ steps: [{ title?, option }] }`.
  const data = buildChartData(spec)

  let generationId: string | null = null
  try {
    const supabase = createServiceClient()
    const auditPrompt = feedback
      ? `chart "${id}": ${requirement.requirement}\n\nFeedback: ${feedback}`
      : `chart "${id}": ${requirement.requirement}`
    const auditParams = { feature: 'generate-chart', refined: Boolean(feedback) }
    const row = await recordGeneration(supabase, {
      kind: 'text',
      storySlug: slug,
      prompt: auditPrompt,
      model,
      params: auditParams,
      requestHash: hashRequest({ model, prompt: auditPrompt, params: auditParams }),
      resultRef: null,
      resultText: JSON.stringify(spec),
    })
    generationId = row.id
  } catch {
    // best-effort audit
  }

  return NextResponse.json({ ok: true, generation: { id: generationId }, data, spec })
}
