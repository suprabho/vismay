import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { ingestSources } from '@vismay/story-pipeline'
import {
  listStorySources,
  insertStorySource,
  updateStorySource,
  deleteStorySource,
  uploadSourceFile,
  removeSourceFile,
  sourceStoragePath,
} from '@vismay/content-source/storySources'

/**
 * Compose stage 1 — add and extract a source for a draft.
 *
 * POST accepts either `multipart/form-data` with a `file`, or JSON `{ url }` /
 * `{ text }`. The original file is kept in the private `story-sources` bucket so
 * extraction can be re-run later; the extracted text lands on the `story_sources`
 * row. GET lists a draft's sources (node hydration); DELETE removes one.
 *
 * Extraction uses the pipeline's pdf-parse/html/csv path today; a multimodal
 * fallback for scanned PDFs/images is a later upgrade.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_FILE_BYTES = 15 * 1024 * 1024 // 15 MB

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  return NextResponse.json({ ok: true, sources: await listStorySources(slug) })
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  const ctype = req.headers.get('content-type') ?? ''

  // ── File upload ──────────────────────────────────────────────────────────
  if (ctype.includes('multipart/form-data')) {
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 })
    }
    const f = form.get('file')
    if (!(f instanceof File)) return NextResponse.json({ error: 'missing "file"' }, { status: 400 })
    if (f.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `"${f.name}" exceeds 15 MB` }, { status: 400 })
    }
    const buffer = Buffer.from(await f.arrayBuffer())
    const mime = f.type || 'application/octet-stream'

    const row = await insertStorySource({
      storySlug: slug,
      kind: 'file',
      filename: f.name,
      mime,
      status: 'pending',
    })
    try {
      const storagePath = sourceStoragePath(slug, row.id, f.name)
      await uploadSourceFile(storagePath, buffer, mime)
      const { sources, failures } = await ingestSources({ files: [{ name: f.name, buffer }] })
      if (sources.length === 0) {
        const error = failures[0]?.reason ?? 'could not extract text'
        await updateStorySource(row.id, { storagePath, status: 'failed', error })
        return NextResponse.json({ ok: true, source: { ...row, storagePath, status: 'failed', error } })
      }
      const s = sources[0]!
      const patch = {
        storagePath,
        title: s.title,
        byline: s.byline ?? null,
        extractedText: s.body,
        status: 'extracted' as const,
      }
      await updateStorySource(row.id, patch)
      return NextResponse.json({ ok: true, source: { ...row, ...patch } })
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      await updateStorySource(row.id, { status: 'failed', error }).catch(() => {})
      return NextResponse.json({ error: `extraction failed: ${error}` }, { status: 502 })
    }
  }

  // ── Link or pasted text (JSON) ───────────────────────────────────────────
  let body: { url?: string; text?: string }
  try {
    body = (await req.json()) as { url?: string; text?: string }
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }

  const url = typeof body.url === 'string' ? body.url.trim() : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''

  if (url) {
    const row = await insertStorySource({ storySlug: slug, kind: 'link', sourceUrl: url, status: 'pending' })
    try {
      const { sources, failures } = await ingestSources({ links: [url] })
      if (sources.length === 0) {
        const error = failures[0]?.reason ?? 'could not fetch/extract'
        await updateStorySource(row.id, { status: 'failed', error })
        return NextResponse.json({ ok: true, source: { ...row, status: 'failed', error } })
      }
      const s = sources[0]!
      const patch = {
        title: s.title,
        byline: s.byline ?? null,
        extractedText: s.body,
        status: 'extracted' as const,
      }
      await updateStorySource(row.id, patch)
      return NextResponse.json({ ok: true, source: { ...row, ...patch } })
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      await updateStorySource(row.id, { status: 'failed', error }).catch(() => {})
      return NextResponse.json({ error: `extraction failed: ${error}` }, { status: 502 })
    }
  }

  if (text) {
    const { sources } = await ingestSources({ texts: [{ body: text }] })
    const s = sources[0]
    const row = await insertStorySource({
      storySlug: slug,
      kind: 'text',
      title: s?.title ?? 'Pasted text',
      extractedText: s?.body ?? text,
      status: 'extracted',
    })
    return NextResponse.json({ ok: true, source: row })
  }

  return NextResponse.json({ error: 'provide a file, "url", or "text"' }, { status: 400 })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing ?id=' }, { status: 400 })

  const row = (await listStorySources(slug)).find((s) => s.id === id)
  if (row?.storagePath) await removeSourceFile(row.storagePath).catch(() => {})
  await deleteStorySource(id)
  return NextResponse.json({ ok: true })
}
