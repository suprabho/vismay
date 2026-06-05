import { isAuthed } from '@/lib/adminAuth'
import {
  generateOutline,
  generateSection,
  assembleStory,
  validateStory,
  serializeStory,
  isAllowedTextModel,
  DEFAULT_TEXT_MODEL,
  type GeneratedSection,
  type SourceDoc,
  type ResearchBrief,
  type ComposeAnswers,
  type StoryFormat,
} from '@vismay/story-pipeline'
import { storyContentDir, uniqueSlug, writeStoryFiles, previewUrlFor } from '../shared'

/**
 * Phase 2 — generate the story IN STEPS and stream progress over SSE.
 *
 * One fast outline call, then one short call per section, so the gateway header
 * timeout (which killed the old single non-streaming call) never triggers. Each
 * step is emitted as it lands: `outline` → `section` (per section) → `done`.
 * The client keeps the outline + sections so it can regenerate any one section
 * afterwards (see the regenerate-section route).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface GenerateBody {
  sources: SourceDoc[]
  brief: ResearchBrief
  answers: ComposeAnswers
  format?: StoryFormat
  model?: string
}

function log(msg: string): void {
  console.log(`[compose/generate] ${msg}`)
}

export async function POST(req: Request): Promise<Response> {
  if (!(await isAuthed())) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: GenerateBody
  try {
    body = (await req.json()) as GenerateBody
  } catch {
    return Response.json({ error: 'expected JSON body' }, { status: 400 })
  }
  if (!Array.isArray(body.sources) || body.sources.length === 0 || !body.brief) {
    return Response.json({ error: 'missing sources or brief' }, { status: 400 })
  }

  const model = isAllowedTextModel(body.model ?? '') ? body.model! : DEFAULT_TEXT_MODEL
  const input = { sources: body.sources, brief: body.brief, answers: body.answers ?? {} }
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (evt: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`))

      try {
        log(`outline: ${body.format ?? body.brief.suggestedFormat} story with ${model}…`)
        const t0 = Date.now()
        const outline = await generateOutline(input, { format: body.format, model })
        log(`outline done in ${Date.now() - t0}ms — ${outline.sections.length} sections`)
        send({ type: 'outline', outline })

        const sections: GeneratedSection[] = []
        for (let i = 0; i < outline.sections.length; i++) {
          const stub = outline.sections[i]!
          const ts = Date.now()
          // eslint-disable-next-line no-await-in-loop
          const section = await generateSection({ outline, stub, ...input }, { model })
          sections.push(section)
          log(`section ${i + 1}/${outline.sections.length} "${stub.heading}" in ${Date.now() - ts}ms`)
          send({ type: 'section', index: i, total: outline.sections.length, section })
        }

        const story = assembleStory(outline, sections)
        const issues = validateStory(story)
        const art = serializeStory(story)
        const dir = storyContentDir()
        const slug = await uniqueSlug(dir, art.slug)
        await writeStoryFiles(dir, slug, art)
        log(`wrote ${slug} (${art.charts.length} chart file(s))${issues.length ? `, ${issues.length} issue(s)` : ''}`)

        send({
          type: 'done',
          slug,
          previewUrl: previewUrlFor(slug),
          format: story.format,
          outline,
          imagePrompts: art.imagePrompts,
          issues,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        log(`failed: ${msg}`)
        send({ type: 'error', error: msg })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  })
}
