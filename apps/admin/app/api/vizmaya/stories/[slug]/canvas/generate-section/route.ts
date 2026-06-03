import { NextResponse } from 'next/server'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { isAuthed } from '@/lib/adminAuth'
import { generateText } from '@vismay/ai-gateway'
import { buildSlotSchemaPrompt } from '@/components/vizmaya/canvas/overrideSchemas'

/**
 * Generate ONE new story section from a brief.
 *
 * Unlike the slot `generate` route (which returns a single string for an
 * existing slot), a section is multi-part: a heading + prose for the markdown
 * AND a config.yaml `sections[]` entry. The model returns a structured object;
 * the client assembles it through `appendStorySection` and saves via the normal
 * PUT (which validates), so nothing here writes to disk.
 *
 * The system prompt composes the foreground/background schema prompts already
 * derived from the layer modules, so the generated visual content parses.
 */

const MODEL = 'text.pro'
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
  configBody: z
    .string()
    .describe(
      'YAML for the section VISUAL content only — the foreground:/background:/map: keys. ' +
        'NOT id, text, or kind. Must be valid YAML.',
    ),
})

interface Body {
  brief: string
  format?: 'deck' | 'map'
}

function systemPrompt(format: 'deck' | 'map'): string {
  const formatGuidance =
    format === 'map'
      ? 'This is a MAP story. configBody should be a `map:` camera block ' +
        '(center [lng, lat], zoom, optional pitch/bearing/pins). A foreground is optional.'
      : 'This is a DECK story. configBody should be a `foreground:` with composable ' +
        'layers (a list, a single layer, or a layout: + regions: mapping). A background is optional.'

  return (
    `You author ONE new section for a Vizmaya ${format} story from the author's brief.\n\n` +
    `Produce:\n` +
    `- heading: a short, specific section heading (becomes the markdown ## heading and the config text anchor).\n` +
    `- paragraphs: the body prose, one string per paragraph, factual and concise.\n` +
    `- kind: one of ${SECTION_KINDS.join(' | ')}.\n` +
    `- configBody: valid YAML for the section's VISUAL content ONLY (foreground:/background:/map: keys). ` +
    `Do NOT include id, text, or kind in configBody.\n\n` +
    `${formatGuidance}\n\n` +
    `Reference existing theme tokens (accent, accent2, teal, positive, amber, red, muted) for colors; ` +
    `do not invent asset URLs — omit images unless the brief supplies a source.\n\n` +
    `The foreground/background follow these EXACT layer schemas:\n\n` +
    `${buildSlotSchemaPrompt('foreground') ?? ''}\n\n` +
    `${buildSlotSchemaPrompt('background') ?? ''}`
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

  let result: z.infer<typeof SectionResult>
  try {
    const out = await generateText({
      model: MODEL,
      system: systemPrompt(format),
      prompt: brief,
      schema: SectionResult,
      metadata: { feature: 'admin-generate-section', slug },
    })
    result = out.result
  } catch (e) {
    return NextResponse.json(
      { error: `section generation failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  // Parse the visual YAML into the config-entry body. A parse failure is a soft
  // warning — the client can still review/insert and the PUT save re-validates.
  let sectionBody: Record<string, unknown> = {}
  let warning: string | null = null
  const rawBody = result.configBody?.trim()
  if (rawBody) {
    try {
      const parsed = parseYaml(rawBody)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        sectionBody = parsed as Record<string, unknown>
      } else {
        warning = 'configBody did not parse to a mapping; section has no visual content'
      }
    } catch (e) {
      warning = `configBody is not valid YAML: ${e instanceof Error ? e.message : 'parse error'}`
    }
  }

  return NextResponse.json({
    ok: true,
    section: {
      heading: result.heading,
      paragraphs: result.paragraphs,
      kind: result.kind,
      body: sectionBody,
    },
    warning,
  })
}
