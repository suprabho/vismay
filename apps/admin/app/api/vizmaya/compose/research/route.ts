import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'
import { hashRequest, recordGeneration } from '@vismay/ai-gateway'
import {
  ingestSources,
  research,
  isAllowedTextModel,
  DEFAULT_TEXT_MODEL,
  type InputFile,
  type InputText,
} from '@vismay/story-pipeline'
import { newSessionId, saveSession, type ComposeSession } from '../shared'

/** Tagged server log so progress is visible in the dev terminal. */
function log(msg: string): void {
  console.log(`[compose/research] ${msg}`)
}

/**
 * Phase 1 of the story composer: ingest pasted links + uploaded files, research
 * them, and return a brief plus the clarifying questions the editor must answer
 * before generation. Stateless — the returned `sources` are re-sent to the
 * generate route with the answers (no session table for this first cut).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_LINKS = 10
const MAX_FILES = 10
const MAX_FILE_BYTES = 15 * 1024 * 1024 // 15 MB per file

export async function POST(req: Request): Promise<Response> {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 })
  }

  const links = String(form.get('links') ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX_LINKS)

  const fileEntries = form.getAll('files').filter((f): f is File => f instanceof File).slice(0, MAX_FILES)
  const files: InputFile[] = []
  for (const f of fileEntries) {
    if (f.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `"${f.name}" exceeds 15 MB` }, { status: 400 })
    }
    files.push({ name: f.name, buffer: Buffer.from(await f.arrayBuffer()) })
  }

  const pasted = String(form.get('text') ?? '').trim()
  const texts: InputText[] = pasted ? [{ body: pasted }] : []

  if (links.length === 0 && files.length === 0 && texts.length === 0) {
    return NextResponse.json({ error: 'add at least one link, file, or some text' }, { status: 400 })
  }

  const modelInput = String(form.get('model') ?? '')
  const model = isAllowedTextModel(modelInput) ? modelInput : DEFAULT_TEXT_MODEL

  log(`ingesting ${links.length} link(s) + ${files.length} file(s) + ${texts.length} pasted text(s)…`)
  const { sources, failures } = await ingestSources({ links, files, texts })
  for (const f of failures) log(`  ✗ skipped ${f.origin} — ${f.reason}`)
  for (const s of sources) log(`  ✓ read ${s.origin} (${s.body.length} chars)`)
  if (sources.length === 0) {
    log('no readable sources — returning 422')
    return NextResponse.json(
      {
        error: 'none of the sources could be read',
        failures,
      },
      { status: 422 },
    )
  }

  let brief
  try {
    log(`researching ${sources.length} source(s) with ${model}…`)
    const t0 = Date.now()
    brief = await research(sources, { model })
    log(`done in ${Date.now() - t0}ms — ${brief.questions.length} question(s), suggested format: ${brief.suggestedFormat}`)
  } catch (e) {
    log(`research failed: ${e instanceof Error ? e.message : String(e)}`)
    return NextResponse.json(
      { error: `research failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  // Best-effort audit — never let a logging failure sink the response.
  try {
    const supabase = createServiceClient()
    const params = { feature: 'compose-research', sources: sources.length, model }
    await recordGeneration(supabase, {
      kind: 'text',
      storySlug: 'compose',
      prompt: sources.map((s) => s.origin).join(', '),
      model,
      params,
      requestHash: hashRequest({ model, prompt: 'compose-research', params }),
      resultRef: null,
      resultText: JSON.stringify(brief),
    })
  } catch {
    // swallow
  }

  // Persist the session so generation (and any retry) can resume from here
  // without re-paying for ingestion + research.
  const sessionId = newSessionId()
  const session: ComposeSession = {
    id: sessionId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    model,
    answers: {},
    sources,
    brief,
    sections: [],
    status: 'researched',
  }
  try {
    await saveSession(session)
  } catch (e) {
    log(`warning: failed to persist session: ${e instanceof Error ? e.message : String(e)}`)
  }

  return NextResponse.json({
    ok: true,
    sessionId,
    sources,
    failures,
    brief,
    questions: brief.questions,
  })
}
