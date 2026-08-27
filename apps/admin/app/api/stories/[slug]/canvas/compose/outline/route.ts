import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'
import { hashRequest, recordGeneration } from '@vismay/ai-gateway'
import {
  generateOutline,
  type ResearchBrief,
  type StoryFormat,
  type ComposeAnswers,
} from '@vismay/story-pipeline'
import { listStorySources } from '@vismay/content-source/storySources'
import {
  readComposeState,
  writeComposeState,
  type ComposeOutlineEntry,
} from '@vismay/content-source/composeState'
import { resolveModel, resolveStoryPack, sourcesToDocs } from '../shared'
import { getFeatureModel } from '@/lib/aiModelSettings'

/**
 * Compose stage 3 — generate (or refine) the outline grounded in the chosen
 * angle + sources, and persist it into `compose_state`. PATCH persists the
 * author's accept/reject/reorder edits to the outline entries. Materialising
 * accepted entries into real sections is a separate step.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface StoredBrief {
  summary?: string
  keyFacts?: string[]
  entities?: string[]
  suggestedFormat?: StoryFormat
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params

  let body: { chosenAngleId?: string; model?: string; feedback?: string; previous?: unknown } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    // empty body is fine
  }

  const state = await readComposeState(slug)
  if (!state) return NextResponse.json({ error: 'no compose draft for this slug' }, { status: 404 })
  if (!state.angles?.length) {
    return NextResponse.json({ error: 'generate angles and pick one first' }, { status: 422 })
  }

  const chosen = state.angles.find((a) => a.id === body.chosenAngleId) ?? state.angles[0]!
  const docs = sourcesToDocs(await listStorySources(slug))
  if (docs.length === 0) {
    return NextResponse.json({ error: 'no extracted sources yet' }, { status: 422 })
  }

  // Per-stage default from the admin "AI models" page (see composeAngles note).
  const model = resolveModel(body.model, await getFeatureModel('composeOutline'))
  const sb = (state.brief ?? {}) as StoredBrief
  const brief: ResearchBrief = {
    summary: sb.summary ?? '',
    keyFacts: sb.keyFacts ?? [],
    entities: sb.entities ?? [],
    suggestedFormat: sb.suggestedFormat ?? state.format,
    candidateAngles: [chosen.title],
    questions: [],
  }
  const answers: ComposeAnswers = { 'lead-angle': `${chosen.title} — ${chosen.thesis}` }
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : ''
  const refine = feedback && body.previous ? { feedback, previous: body.previous } : undefined

  const pack = await resolveStoryPack(slug)
  let outline
  try {
    outline = await generateOutline(
      { sources: docs, brief, answers },
      { format: state.format, model, refine, pack },
    )
  } catch (e) {
    return NextResponse.json(
      { error: `outline generation failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  const entries: ComposeOutlineEntry[] = outline.sections.map((s, i) => ({
    id: `s${i + 1}`,
    heading: s.heading,
    intent: s.intent,
    kind: s.kind,
    context: s.context,
    expectedContent: s.expectedContent,
    visual: s.visual,
    layout: s.layout,
    chartId: s.chartId,
    geo: s.geo,
    regionRequirement: s.regionRequirement,
    subsections: s.subsections,
    status: 'pending',
    sectionId: null,
  }))

  await writeComposeState(slug, {
    ...state,
    phase: 'outline',
    model,
    chosenAngleId: chosen.id,
    outline: entries,
    storyOutline: outline,
    imagePrompts: outline.imagePrompts,
  })

  try {
    const supabase = createServiceClient()
    const params2 = { feature: 'compose-outline', refined: Boolean(feedback) }
    await recordGeneration(supabase, {
      kind: 'text',
      storySlug: slug,
      prompt: `outline for angle "${chosen.title}"`,
      model,
      params: params2,
      requestHash: hashRequest({ model, prompt: `outline:${slug}:${Date.now()}`, params: params2 }),
      resultRef: null,
      resultText: JSON.stringify(entries),
    })
  } catch {
    // best-effort audit
  }

  return NextResponse.json({ ok: true, outline: entries, storyOutline: outline, desk: pack.id })
}

/** Persist the author's accept/reject/reorder edits to the outline entries. */
export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params

  let body: { outline?: ComposeOutlineEntry[] }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }
  if (!Array.isArray(body.outline)) {
    return NextResponse.json({ error: 'missing "outline" array' }, { status: 400 })
  }

  const state = await readComposeState(slug)
  if (!state) return NextResponse.json({ error: 'no compose draft for this slug' }, { status: 404 })

  await writeComposeState(slug, { ...state, outline: body.outline })
  return NextResponse.json({ ok: true })
}
