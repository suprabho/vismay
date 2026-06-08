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
  type ResearchBrief,
  type StoryFormat,
} from '@vismay/story-pipeline'
import { getFeatureModel } from '@/lib/aiModelSettings'
import { sourcesToDocs } from '../shared'

/**
 * Compose stage 3.6 — generate the DATA for every chart the outline planned.
 *
 * The outline declares charts as REQUIREMENTS (id/type/title + what to plot, no
 * numbers); this batch step runs the source-grounded `generateChart` pass over
 * each one and writes the resulting ECharts option to the `chart_data` store, so
 * any chart layer the VISUAL pass later emits (which references a chart id)
 * actually resolves. Per-chart regeneration is also available from the canvas
 * chart node. Idempotent: re-running overwrites with fresh data.
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

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params

  const state = await readComposeState(slug)
  if (!state) return NextResponse.json({ error: 'no compose draft for this slug' }, { status: 404 })

  const charts =
    ((state.storyOutline as { charts?: ChartRequirement[] } | undefined)?.charts) ?? []
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
  const src = getContentSource()
  const supabase = createServiceClient()

  // Generate + write one chart, capturing its outcome (never throws).
  const runOne = async (
    requirement: ChartRequirement,
  ): Promise<{ id: string; ok: boolean; error?: string }> => {
    try {
      const spec = await generateChart({ requirement, brief, sources: docs }, { model })
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
