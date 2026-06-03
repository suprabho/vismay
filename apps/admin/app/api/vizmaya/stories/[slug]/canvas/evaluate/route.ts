import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'
import { generateText, hashRequest, recordGeneration } from '@vismay/ai-gateway'
import { screenshotCanvasSection } from '@/lib/canvasScreenshot'
import { getFeatureModel } from '@/lib/aiModelSettings'

/**
 * Evaluate one rendered story section.
 *
 * Screenshots the section (the real headless canvas-frame render), sends the
 * image + the section config to a vision model, and returns an aspect-keyed
 * critique. Each critique names the slot (`aspect`) that would fix it, so the
 * canvas can route it back to that input node as an Apply / ✨-prompt action.
 *
 * v1 covers the frame-input aspects (content/layout/theme/background/foreground/
 * narration) — always present for the active section. Manual trigger only.
 */

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/
const MAX_CONFIG_LENGTH = 8000

const ASPECTS = [
  'content',
  'layout',
  'theme',
  'background',
  'foreground',
  'narration',
] as const

const Critique = z.object({
  aspect: z.enum(ASPECTS).describe('The slot that would fix this — where the critique routes to'),
  severity: z.enum(['low', 'medium', 'high']),
  issue: z.string().describe('What is wrong, grounded in the rendered screenshot'),
  suggestedPrompt: z
    .string()
    .describe("A prompt ready to drop into that slot's AI generate to fix the issue"),
  suggestedValue: z
    .string()
    .optional()
    .describe('Optional concrete replacement value (slot-shaped YAML/text) when confident'),
})

const EvalResult = z.object({
  critiques: z.array(Critique),
  notes: z.string().describe('Overall read of the section — what works, what to prioritise'),
})

const SYSTEM = `You are a meticulous design + editorial critic reviewing ONE rendered
section ("slide") of a data-driven visual story. You are shown a screenshot of the
section and its config. Identify concrete, actionable problems with what you SEE —
legibility, hierarchy, layout balance, colour/theme, empty or overflowing space,
chart/map readability, copy clarity.

For each problem, return a critique tied to the ASPECT (the slot that fixes it):
- content: the section's prose/copy
- layout: the foreground layout choice
- theme: colours and fonts
- background: the backdrop (map / image / none)
- foreground: the composed visual layers (stats, charts, text, images)
- narration: the spoken script

Each critique has a severity, a specific issue, and a suggestedPrompt the author can
feed to that slot's AI generator. Add a suggestedValue only when you are confident of a
concrete fix. Prefer a few high-signal critiques over many trivial ones. If the section
reads well, return an empty critiques array and say so in notes. Ground everything in the
screenshot — do not invent problems you cannot see.`

interface Body {
  sectionId: string
  /** The section's config YAML, for context (optional). */
  config?: string
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) {
    return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }
  const sectionId = typeof body.sectionId === 'string' ? body.sectionId.trim() : ''
  if (!sectionId) {
    return NextResponse.json({ error: 'missing "sectionId"' }, { status: 400 })
  }

  // 1. Screenshot the rendered section.
  let shot
  try {
    shot = await screenshotCanvasSection({ slug, sectionId })
  } catch (e) {
    return NextResponse.json(
      { error: `screenshot failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  // 2. Critique it with a vision model, constrained to the aspect schema.
  const config =
    typeof body.config === 'string' ? body.config.slice(0, MAX_CONFIG_LENGTH) : ''
  const prompt =
    `Evaluate this section.${config ? `\n\nSection config (YAML):\n${config}` : ''}`

  let result: z.infer<typeof EvalResult>
  let modelUsed: string
  try {
    const out = await generateText({
      model: await getFeatureModel('evaluate'),
      system: SYSTEM,
      prompt,
      images: [{ data: shot.bytes.toString('base64'), mimeType: shot.mimeType }],
      schema: EvalResult,
      metadata: { feature: 'admin-canvas-evaluate', slug },
    })
    result = out.result
    modelUsed = out.modelUsed
  } catch (e) {
    return NextResponse.json(
      { error: `evaluation failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  // 3. Audit (non-fatal).
  let auditWarning: string | null = null
  try {
    const supabase = createServiceClient()
    await recordGeneration(supabase, {
      kind: 'text',
      storySlug: slug,
      prompt: `evaluate:${sectionId}`,
      model: modelUsed,
      params: { feature: 'canvas-evaluate', sectionId, aspects: ASPECTS.length },
      requestHash: hashRequest({
        model: modelUsed,
        prompt: `evaluate:${sectionId}`,
        params: { url: shot.url },
      }),
      resultRef: null,
      resultText: JSON.stringify(result),
    })
  } catch (e) {
    auditWarning = e instanceof Error ? e.message : 'audit log insert failed'
  }

  return NextResponse.json({
    ok: true,
    ...result,
    generation: { model: modelUsed, auditWarning },
  })
}
