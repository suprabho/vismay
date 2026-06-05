import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'
import { hashRequest, recordGeneration } from '@vismay/ai-gateway'
import { ingestSources, research, type InputFile } from '@vismay/story-pipeline'

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

  if (links.length === 0 && files.length === 0) {
    return NextResponse.json({ error: 'add at least one link or file' }, { status: 400 })
  }

  const sources = await ingestSources({ links, files })
  if (sources.length === 0) {
    return NextResponse.json(
      { error: 'none of the sources could be read (unreachable links or unsupported files)' },
      { status: 422 },
    )
  }

  let brief
  try {
    brief = await research(sources)
  } catch (e) {
    return NextResponse.json(
      { error: `research failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  // Best-effort audit — never let a logging failure sink the response.
  try {
    const supabase = createServiceClient()
    const params = { feature: 'compose-research', sources: sources.length }
    await recordGeneration(supabase, {
      kind: 'text',
      storySlug: 'compose',
      prompt: sources.map((s) => s.origin).join(', '),
      model: 'text.pro',
      params,
      requestHash: hashRequest({ model: 'text.pro', prompt: 'compose-research', params }),
      resultRef: null,
      resultText: JSON.stringify(brief),
    })
  } catch {
    // swallow
  }

  return NextResponse.json({
    ok: true,
    sources,
    brief,
    questions: brief.questions,
  })
}
