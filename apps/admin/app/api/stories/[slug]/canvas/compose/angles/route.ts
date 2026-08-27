import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'
import { hashRequest, recordGeneration } from '@vismay/ai-gateway'
import { generateAngles } from '@vismay/story-pipeline'
import { listStorySources } from '@vismay/content-source/storySources'
import { readComposeState, writeComposeState } from '@vismay/content-source/composeState'
import { resolveModel, resolveStoryPack, sourcesToDocs } from '../shared'
import { getFeatureModel } from '@/lib/aiModelSettings'

/**
 * Compose stage 2 — generate (or refine) the angle options from the draft's
 * extracted sources, and persist them into `compose_state`. The author then
 * picks one, which the outline stage is grounded in.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params

  let body: { model?: string; feedback?: string; previous?: unknown; focus?: string } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    // empty body is fine — first generation
  }

  const state = await readComposeState(slug)
  if (!state) return NextResponse.json({ error: 'no compose draft for this slug' }, { status: 404 })

  const docs = sourcesToDocs(await listStorySources(slug))
  if (docs.length === 0) {
    return NextResponse.json({ error: 'no extracted sources yet — add a source first' }, { status: 422 })
  }

  // Per-stage default from the admin "AI models" page; body.model (unused today)
  // still wins, and state.model is intentionally not the fallback so each stage
  // is controlled independently rather than pinned by whatever angles picked.
  const model = resolveModel(body.model, await getFeatureModel('composeAngles'))
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : ''
  const refine = feedback && body.previous ? { feedback, previous: body.previous } : undefined
  // "Create recap" launches angle generation with a match-day-recap steer.
  const focus = body.focus === 'recap' ? 'recap' : undefined

  const pack = await resolveStoryPack(slug)
  let result
  try {
    result = await generateAngles(docs, { model, refine, pack, focus })
  } catch (e) {
    return NextResponse.json(
      { error: `angle generation failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  await writeComposeState(slug, {
    ...state,
    phase: 'angles',
    model,
    angles: result.angles,
    brief: {
      summary: result.summary,
      keyFacts: result.keyFacts,
      entities: result.entities,
      suggestedFormat: result.suggestedFormat,
    },
  })

  try {
    const supabase = createServiceClient()
    const params2 = { feature: 'compose-angles', refined: Boolean(feedback), focus: focus ?? null }
    await recordGeneration(supabase, {
      kind: 'text',
      storySlug: slug,
      prompt: `angles for ${docs.length} source(s)`,
      model,
      params: params2,
      requestHash: hashRequest({ model, prompt: `angles:${slug}:${Date.now()}`, params: params2 }),
      resultRef: null,
      resultText: JSON.stringify(result.angles),
    })
  } catch {
    // best-effort audit
  }

  return NextResponse.json({
    ok: true,
    angles: result.angles,
    suggestedFormat: result.suggestedFormat,
    desk: pack.id,
  })
}

/**
 * Persist the author's angle pick. Selecting an angle is otherwise client-only
 * until the outline stage writes it through, so a reload between picking and
 * outlining would lose the choice. This stores `chosenAngleId` immediately.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params

  let body: { chosenAngleId?: string } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const state = await readComposeState(slug)
  if (!state) return NextResponse.json({ error: 'no compose draft for this slug' }, { status: 404 })
  if (!state.angles.some((a) => a.id === body.chosenAngleId)) {
    return NextResponse.json({ error: 'unknown angle' }, { status: 422 })
  }

  await writeComposeState(slug, { ...state, chosenAngleId: body.chosenAngleId })
  return NextResponse.json({ ok: true })
}
