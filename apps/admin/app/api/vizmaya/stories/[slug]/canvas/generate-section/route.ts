import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'
import { hashRequest, recordGeneration } from '@vismay/ai-gateway'
import {
  generateSectionContent,
  generateSectionVisual,
  type SectionContext,
  type SectionContentDraft,
} from '@vismay/story-pipeline'
import { getFeatureModel } from '@/lib/aiModelSettings'

/**
 * Generate ONE story section from a free-text brief.
 *
 * This is a thin adapter over the `@vismay/story-pipeline` engine — the single
 * canonical section generator (prompts + the viz-engine `sectionBodySchema`
 * live there, used by both the compose pipeline and this route). The route only
 * adds the admin concerns: auth, per-feature model pick, and the audit row.
 *
 * The section is produced in two passes so the author can refine narrative and
 * visuals independently:
 *   - `phase: 'content'` → `{ heading, paragraphs, kind }` (the markdown prose)
 *   - `phase: 'visual'`  → `{ ...content, body }` (the config.yaml visual body,
 *      given the accepted `content`)
 *   - `phase: 'combined'` (default) → both passes, merged. Back-compat shape.
 *
 * The visual `body` is structured JSON constrained by the renderer's own layer
 * schemas, so it can never carry malformed YAML; it is serialised downstream via
 * `appendStorySection` + the normal PUT (which validates). Nothing here writes.
 */

const MAX_BRIEF_LENGTH = 2000
const MAX_FEEDBACK_LENGTH = 2000

interface SectionDraft {
  heading: string
  paragraphs: string[]
  kind: string
  body?: Record<string, unknown>
}

interface Body {
  brief: string
  format?: 'deck' | 'map'
  /** Which pass to run; defaults to the combined (content + visual) shape. */
  phase?: 'content' | 'visual' | 'combined'
  /** Refine loop: the author's note on what to change about `previous`. */
  feedback?: string
  /** Refine loop: the prior draft the feedback is about. */
  previous?: SectionDraft
  /** The accepted prose — required for the `visual` pass. */
  content?: SectionContentDraft
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { slug } = await params

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }

  const brief = typeof body.brief === 'string' ? body.brief.trim() : ''
  if (!brief) {
    return NextResponse.json({ error: 'missing "brief"' }, { status: 400 })
  }
  if (brief.length > MAX_BRIEF_LENGTH) {
    return NextResponse.json(
      { error: `brief exceeds ${MAX_BRIEF_LENGTH} chars` },
      { status: 400 },
    )
  }
  const format = body.format === 'map' ? 'map' : 'deck'
  const phase = body.phase ?? 'combined'

  const feedback =
    typeof body.feedback === 'string'
      ? body.feedback.trim().slice(0, MAX_FEEDBACK_LENGTH)
      : ''
  const refine = feedback && body.previous ? { feedback, previous: body.previous } : undefined

  if (phase === 'visual' && !body.content) {
    return NextResponse.json(
      { error: 'the "visual" phase requires accepted "content"' },
      { status: 400 },
    )
  }

  const ctx: SectionContext = { source: 'brief', format, brief }
  const model = await getFeatureModel('generateSection')

  let section: SectionDraft
  try {
    if (phase === 'content') {
      section = await generateSectionContent(ctx, { model, refine })
    } else if (phase === 'visual') {
      const { body: visualBody } = await generateSectionVisual(ctx, body.content!, { model, refine })
      section = { ...body.content!, body: visualBody }
    } else {
      const content = await generateSectionContent(ctx, { model, refine })
      const { body: visualBody } = await generateSectionVisual(ctx, content, { model })
      section = { ...content, body: visualBody }
    }
  } catch (e) {
    return NextResponse.json(
      { error: `section generation failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  // Audit row (text kind, the whole section serialised) so the draft can be
  // rated. Best-effort: a logging failure must not sink the generation.
  let generationId: string | null = null
  try {
    const supabase = createServiceClient()
    const auditPrompt = feedback ? `${brief}\n\nFeedback: ${feedback}` : brief
    const auditParams = { feature: 'generate-section', format, phase, refined: Boolean(feedback) }
    const row = await recordGeneration(supabase, {
      kind: 'text',
      storySlug: slug,
      prompt: auditPrompt,
      model,
      params: auditParams,
      requestHash: hashRequest({ model, prompt: auditPrompt, params: auditParams }),
      resultRef: null,
      resultText: JSON.stringify(section),
    })
    generationId = row.id
  } catch {
    // swallow — generationId stays null, rating UI just won't show
  }

  return NextResponse.json({
    ok: true,
    generation: { id: generationId },
    section,
  })
}
