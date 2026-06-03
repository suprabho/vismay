import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'
import { generateText, hashRequest, recordGeneration } from '@vismay/ai-gateway'
import {
  sectionBodySchema,
  normalizeSectionBody,
  GEN_FOREGROUND_TYPES,
} from '@vismay/viz-engine'
import { getFeatureModel } from '@/lib/aiModelSettings'

/**
 * Generate ONE new story section from a brief.
 *
 * Unlike the slot `generate` route (which returns a single string for an
 * existing slot), a section is multi-part: a heading + prose for the markdown
 * AND a config.yaml `sections[]` entry. The model returns a fully structured
 * object — including the visual `body` — which the client assembles through
 * `appendStorySection` and saves via the normal PUT (which validates), so
 * nothing here writes to disk.
 *
 * The visual content is NOT a hand-written YAML string anymore. `body` is
 * constrained by `sectionBodySchema` (built from the same Zod layer schemas the
 * renderer validates with), so the model fills typed JSON at the provider
 * level — it cannot emit malformed YAML. We reshape it with
 * `normalizeSectionBody` and serialise to YAML deterministically downstream.
 */

const MAX_BRIEF_LENGTH = 2000

const SECTION_KINDS = [
  'text',
  'hero',
  'stat',
  'cover',
  'bigStat',
  'bodyText',
  'split',
  'data',
  'gallery',
  'quote',
  'divider',
  'closing',
] as const

const SectionResult = z.object({
  heading: z
    .string()
    .describe('Short, specific section heading — becomes the markdown ## and the config `text` anchor'),
  paragraphs: z
    .array(z.string())
    .describe('Section body prose, one string per paragraph (factual magazine register)'),
  kind: z.enum(SECTION_KINDS).describe('The section kind'),
  body: sectionBodySchema.describe(
    'The section VISUAL content: foreground layers (and optional background/map). ' +
      'Leave empty for a text-only section.',
  ),
})

/** The shape the route returns and the client re-sends to refine. */
interface SectionDraft {
  heading: string
  paragraphs: string[]
  kind: string
  body: Record<string, unknown>
}

interface Body {
  brief: string
  format?: 'deck' | 'map'
  /** Refine loop: the author's note on what to change about `previous`. */
  feedback?: string
  /** Refine loop: the prior draft the feedback is about. */
  previous?: SectionDraft
}

const MAX_FEEDBACK_LENGTH = 2000

function systemPrompt(format: 'deck' | 'map'): string {
  const formatGuidance =
    format === 'map'
      ? 'This is a MAP story. Set `body.map` to the section camera (center [lng, lat], ' +
        'zoom, optional pitch/bearing/pins). A foreground is optional.'
      : 'This is a DECK story. Set `body.foreground`: either a flat `layers` list, or a ' +
        '`layout` name plus `regions` (each region maps to its own layers). A background is optional.'

  const layerMenu = GEN_FOREGROUND_TYPES.map((l) => `- ${l.type}: ${l.label}`).join('\n')

  return (
    `You author ONE new section for a Vizmaya ${format} story from the author's brief.\n\n` +
    `Produce a structured object:\n` +
    `- heading: a short, specific section heading (becomes the markdown ## heading and the config text anchor).\n` +
    `- paragraphs: the body prose, one string per paragraph, factual and concise.\n` +
    `- kind: one of ${SECTION_KINDS.join(' | ')}.\n` +
    `- body: the section's VISUAL content as structured fields (NOT YAML, NOT a string). ` +
    `Each foreground layer has a \`type\` and that type's own fields.\n\n` +
    `${formatGuidance}\n\n` +
    `Available foreground layer types:\n${layerMenu}\n\n` +
    `Reference existing theme tokens (accent, accent2, teal, positive, amber, red, muted) for colors. ` +
    `Do not invent image/asset URLs — omit image and imageGrid layers unless the brief supplies a source. ` +
    `For a chart layer, only reference a chart id the brief names; do not invent one.`
  )
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

  // Refine loop: when the author sends a note about the prior draft, fold both
  // into the user prompt so the model revises that draft instead of starting
  // over. The system prompt (layer menu, constraints) is unchanged.
  const feedback =
    typeof body.feedback === 'string'
      ? body.feedback.trim().slice(0, MAX_FEEDBACK_LENGTH)
      : ''
  const userPrompt =
    feedback && body.previous
      ? `${brief}\n\nPrevious draft:\n${JSON.stringify(body.previous)}\n\n` +
        `Revise that draft per this feedback (keep what works, change only what's noted):\n${feedback}`
      : brief

  const model = await getFeatureModel('generateSection')
  let result: z.infer<typeof SectionResult>
  let modelUsed = model
  try {
    const out = await generateText({
      model,
      system: systemPrompt(format),
      prompt: userPrompt,
      schema: SectionResult,
      metadata: { feature: 'admin-generate-section', slug },
    })
    result = out.result
    modelUsed = out.modelUsed
  } catch (e) {
    return NextResponse.json(
      { error: `section generation failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  // The body is already schema-valid structured JSON — reshape it into the
  // config-entry the engine parses (regions array → mapping, drop empties).
  // No YAML parsing, no fixers: the section can never carry invalid visual YAML.
  const sectionBody = normalizeSectionBody(result.body)
  const section: SectionDraft = {
    heading: result.heading,
    paragraphs: result.paragraphs,
    kind: result.kind,
    body: sectionBody,
  }

  // Audit row (text kind, the whole section serialised) so the draft can be
  // rated. Best-effort: a logging failure must not sink the generation — the
  // author still gets their section, just without a feedback handle.
  let generationId: string | null = null
  try {
    const supabase = createServiceClient()
    const params = { feature: 'generate-section', format, refined: Boolean(feedback) }
    const row = await recordGeneration(supabase, {
      kind: 'text',
      storySlug: slug,
      prompt: userPrompt,
      model: modelUsed,
      params,
      requestHash: hashRequest({ model: modelUsed, prompt: userPrompt, params }),
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
