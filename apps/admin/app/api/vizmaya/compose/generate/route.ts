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
import {
  storyContentDir,
  uniqueSlug,
  writeStoryFiles,
  previewUrlFor,
  newSessionId,
  loadSession,
  saveSession,
  type ComposeSession,
} from '../shared'

/**
 * Phase 2 — generate the story IN STEPS, stream progress over SSE, and PERSIST
 * each step.
 *
 * One fast outline call, then one short call per section. Every step is saved to
 * the compose session the instant it lands, so a run that fails partway can be
 * retried with the same `sessionId` and resumes — reusing the outline and any
 * sections already written instead of re-paying for them. Events: `outline` →
 * `section` (per section) → `done`.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DEFAULT_BATCH = 3

interface GenerateBody {
  sessionId?: string
  answers?: ComposeAnswers
  format?: StoryFormat
  model?: string
  /** How many NEW sections to generate this run, then pause (default 3). */
  batchSize?: number
  // Fallback when there's no session on disk (e.g. it was pruned).
  sources?: SourceDoc[]
  brief?: ResearchBrief
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

  const model = isAllowedTextModel(body.model ?? '') ? body.model! : DEFAULT_TEXT_MODEL
  const batchSize = Math.max(1, Math.min(10, Math.floor(body.batchSize ?? DEFAULT_BATCH)))

  // Resolve the session: prefer the saved one (enables resume); else build a
  // fresh persisted session from the inline sources/brief fallback.
  let session = body.sessionId ? await loadSession(body.sessionId) : null
  if (!session) {
    if (!Array.isArray(body.sources) || body.sources.length === 0 || !body.brief) {
      return Response.json({ error: 'missing session or sources/brief' }, { status: 400 })
    }
    const now = new Date().toISOString()
    session = {
      id: newSessionId(),
      createdAt: now,
      updatedAt: now,
      model,
      answers: body.answers ?? {},
      sources: body.sources,
      brief: body.brief,
      sections: [],
      status: 'researched',
    }
  }
  // The session is non-null from here.
  const s: ComposeSession = session
  s.model = model
  s.format = body.format ?? s.format
  s.answers = body.answers ?? s.answers ?? {}
  s.status = 'generating'
  await saveSession(s).catch(() => {})

  const input = { sources: s.sources, brief: s.brief, answers: s.answers }
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (evt: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`))

      try {
        // Outline — reuse the saved one on resume.
        let resumed = 0
        let outline = s.outline
        if (outline) {
          log(`resuming session ${s.id} — outline + ${s.sections.filter(Boolean).length} section(s) cached`)
        } else {
          log(`outline: ${s.format ?? s.brief.suggestedFormat} story with ${model}…`)
          const t0 = Date.now()
          outline = await generateOutline(input, { format: s.format, model })
          s.outline = outline
          s.sections = new Array(outline.sections.length).fill(null)
          await saveSession(s).catch(() => {})
          log(`outline done in ${Date.now() - t0}ms — ${outline.sections.length} sections`)
        }
        send({ type: 'outline', outline })

        // Generate at most `batchSize` NEW sections this run, then pause — keeps
        // each request short/cheap and lets the editor review in chunks. Cached
        // sections (from the session) stream back instantly and don't count.
        const total = outline.sections.length
        let madeThisRun = 0
        for (let i = 0; i < total; i++) {
          const cached = s.sections[i]
          if (cached) {
            resumed++
            send({ type: 'section', index: i, total, section: cached, cached: true })
            continue
          }
          if (madeThisRun >= batchSize) break // pause — leave the rest for "Continue"
          const stub = outline.sections[i]!
          const ts = Date.now()
          // eslint-disable-next-line no-await-in-loop
          const section = await generateSection({ outline, stub, ...input }, { model })
          s.sections[i] = section
          madeThisRun++
          // Persist immediately — this is the expensive call we never want to lose.
          // eslint-disable-next-line no-await-in-loop
          await saveSession(s).catch(() => {})
          log(`section ${i + 1}/${total} "${stub.heading}" in ${Date.now() - ts}ms (saved)`)
          send({ type: 'section', index: i, total, section })
        }
        if (resumed) log(`reused ${resumed} cached section(s) — no regeneration cost`)

        // Write the story so far (partial or complete) so it's previewable.
        const sections = s.sections.filter((x): x is GeneratedSection => x != null)
        const allDone = sections.length === total
        const story = assembleStory(outline, sections)
        const issues = validateStory(story)
        const art = serializeStory(story)
        const dir = storyContentDir()
        const slug = s.slug ?? (await uniqueSlug(dir, art.slug))
        await writeStoryFiles(dir, slug, art)
        s.slug = slug
        s.status = allDone ? 'done' : 'generating'
        await saveSession(s).catch(() => {})
        log(
          `wrote ${slug} — ${sections.length}/${total} sections${allDone ? ' (complete)' : ' (paused)'}`,
        )

        send({
          type: allDone ? 'done' : 'paused',
          sessionId: s.id,
          slug,
          previewUrl: previewUrlFor(slug),
          format: story.format,
          outline,
          imagePrompts: art.imagePrompts,
          issues,
          done: sections.length,
          total,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        s.status = 'error'
        await saveSession(s).catch(() => {})
        log(`failed: ${msg} (progress saved — retry the same session to resume)`)
        send({ type: 'error', error: msg, sessionId: s.id })
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
