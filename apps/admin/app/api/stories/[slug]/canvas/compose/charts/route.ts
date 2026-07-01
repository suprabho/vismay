import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'
import { hashRequest, recordGeneration } from '@vismay/ai-gateway'
import { getContentSource } from '@vismay/content-source/contentSource'
import { listStorySources } from '@vismay/content-source/storySources'
import { readComposeState, writeComposeState } from '@vismay/content-source/composeState'
import {
  generateChart,
  generateChartRequirement,
  buildChartData,
  type ChartRequirement,
  type ResearchBrief,
  type StoryFormat,
} from '@vismay/story-pipeline'
import { getFeatureModel } from '@/lib/aiModelSettings'
import { resolveStoryPack, sourcesToDocs } from '../shared'

/**
 * Compose stage 3.6 — generate the DATA for every chart the outline planned.
 *
 * The outline declares charts as REQUIREMENTS (id/type/title + what to plot, no
 * numbers); this batch step runs the source-grounded `generateChart` pass over
 * each one and writes the resulting ECharts option to the `chart_data` store, so
 * any chart layer the VISUAL pass later emits (which references a chart id)
 * actually resolves. Per-chart regeneration is also available from the canvas
 * chart node. Idempotent: re-running overwrites with fresh data.
 *
 * An optional `{ id }` body narrows the run to a SINGLE chart — the per-chart
 * "Retry" on a failed card — so a lone failure can be re-generated without
 * re-running (and overwriting) the charts that already succeeded.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** How many charts to generate at once (each is an LLM call). */
const CHART_CONCURRENCY = 3

interface StoredBrief {
  summary?: string
  keyFacts?: string[]
  entities?: string[]
  suggestedFormat?: StoryFormat
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params

  // Optional `{ id }` narrows the run to a single chart (the per-chart Retry on
  // a failed card). No body / no id regenerates every planned chart.
  let onlyId = ''
  try {
    const body = (await req.json()) as { id?: unknown }
    if (typeof body?.id === 'string') onlyId = body.id
  } catch {
    // no body — regenerate all
  }

  const state = await readComposeState(slug)
  if (!state) return NextResponse.json({ error: 'no compose draft for this slug' }, { status: 404 })

  const planned =
    ((state.storyOutline as { charts?: ChartRequirement[] } | undefined)?.charts) ?? []
  const charts = onlyId ? planned.filter((c) => c.id === onlyId) : planned
  if (onlyId && charts.length === 0) {
    return NextResponse.json({ error: `chart "${onlyId}" not found in outline` }, { status: 404 })
  }
  if (charts.length === 0) {
    return NextResponse.json({ ok: true, charts: [] })
  }

  const docs = sourcesToDocs(await listStorySources(slug))
  if (docs.length === 0) {
    return NextResponse.json({ error: 'no extracted sources to ground the charts' }, { status: 422 })
  }

  const sb = (state.brief ?? {}) as StoredBrief
  const brief: ResearchBrief = {
    summary: sb.summary ?? '',
    keyFacts: sb.keyFacts ?? [],
    entities: sb.entities ?? [],
    suggestedFormat: sb.suggestedFormat ?? state.format,
    candidateAngles: [],
    questions: [],
  }
  const model = await getFeatureModel('generateChart')
  const pack = await resolveStoryPack(slug)
  const src = getContentSource()
  const supabase = createServiceClient()

  // Generate + write one chart, capturing its outcome (never throws).
  const runOne = async (
    requirement: ChartRequirement,
  ): Promise<{ id: string; ok: boolean; error?: string }> => {
    try {
      const spec = await generateChart({ requirement, brief, sources: docs }, { model, pack })
      await src.writeChart(slug, requirement.id, buildChartData(spec))
      try {
        const params2 = { feature: 'compose-chart' }
        await recordGeneration(supabase, {
          kind: 'text',
          storySlug: slug,
          prompt: `chart "${requirement.id}": ${requirement.requirement}`,
          model,
          params: params2,
          requestHash: hashRequest({
            model,
            prompt: `chart:${slug}:${requirement.id}`,
            params: params2,
          }),
          resultRef: null,
          resultText: JSON.stringify(spec),
        })
      } catch {
        // best-effort audit
      }
      return { id: requirement.id, ok: true }
    } catch (e) {
      return { id: requirement.id, ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  // Bounded concurrency: walk the list in chunks of CHART_CONCURRENCY.
  const results: Array<{ id: string; ok: boolean; error?: string }> = []
  for (let i = 0; i < charts.length; i += CHART_CONCURRENCY) {
    const chunk = await Promise.all(charts.slice(i, i + CHART_CONCURRENCY).map(runOne))
    results.push(...chunk)
  }

  return NextResponse.json({ ok: true, charts: results })
}

/**
 * Re-plan ONE chart's REQUIREMENT (its prompt — chartType/title/axes + what to
 * plot), optionally steered by an author note, and persist it back into the
 * outline's `storyOutline.charts`. This is the plan, not the data: the author
 * regenerates the chart data (POST above, or the canvas node) afterwards. The
 * chart id is preserved so any layer referencing it stays valid.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params

  let body: { id?: string; feedback?: string } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'missing "id"' }, { status: 400 })
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : ''

  const state = await readComposeState(slug)
  if (!state) return NextResponse.json({ error: 'no compose draft for this slug' }, { status: 404 })

  const storyOutline = (state.storyOutline ?? null) as { charts?: ChartRequirement[] } | null
  const charts = storyOutline?.charts ?? []
  const target = charts.find((c) => c.id === id)
  if (!storyOutline || !target) {
    return NextResponse.json({ error: 'chart not found in outline' }, { status: 404 })
  }

  const docs = sourcesToDocs(await listStorySources(slug))
  if (docs.length === 0) {
    return NextResponse.json({ error: 'no extracted sources to ground the chart' }, { status: 422 })
  }

  const sb = (state.brief ?? {}) as StoredBrief
  const chosen = state.angles.find((a) => a.id === state.chosenAngleId) ?? state.angles[0]
  const brief: ResearchBrief = {
    summary: sb.summary ?? '',
    keyFacts: sb.keyFacts ?? [],
    entities: sb.entities ?? [],
    suggestedFormat: sb.suggestedFormat ?? state.format,
    candidateAngles: chosen ? [`${chosen.title} — ${chosen.thesis}`] : [],
    questions: [],
  }
  const model = await getFeatureModel('generateChart')
  const pack = await resolveStoryPack(slug)

  let next: ChartRequirement
  try {
    next = await generateChartRequirement(
      { requirement: target, brief, sources: docs },
      { model, pack, feedback: feedback || undefined },
    )
  } catch (e) {
    return NextResponse.json(
      { error: `chart prompt generation failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  const nextCharts = charts.map((c) => (c.id === id ? next : c))
  await writeComposeState(slug, {
    ...state,
    storyOutline: { ...storyOutline, charts: nextCharts },
  })

  try {
    const supabase = createServiceClient()
    const params2 = { feature: 'compose-chart-requirement', refined: Boolean(feedback) }
    await recordGeneration(supabase, {
      kind: 'text',
      storySlug: slug,
      prompt: `chart prompt "${id}"${feedback ? `: ${feedback}` : ''}`,
      model,
      params: params2,
      requestHash: hashRequest({ model, prompt: `chart-req:${slug}:${id}:${Date.now()}`, params: params2 }),
      resultRef: null,
      resultText: JSON.stringify(next),
    })
  } catch {
    // best-effort audit
  }

  return NextResponse.json({ ok: true, chart: next })
}
