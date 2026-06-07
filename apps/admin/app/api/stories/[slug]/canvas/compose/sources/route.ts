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
import {
  isSourceExtractDispatchConfigured,
  dispatchSourceExtractJob,
} from '@vismay/content-source/storySourceExtractDispatch'

/**
 * Compose stage 1 — add and extract a source for a draft.
 *
 * POST accepts either `multipart/form-data` with a `file`, or JSON `{ url }` /
 * `{ text }`. The original file is kept in the private `story-sources` bucket so
 * extraction can be re-run later; the extracted text lands on the `story_sources`
 * row. GET lists a draft's sources (node hydration); DELETE removes one.
 *
 * PDFs are read by an open-weights Gemma vision model (rasterise each page →
 * markdown), which is far cleaner than the pdf-parse text layer for
 * graphical/financial/scanned PDFs but runs ~75–130s/page — too slow for a
 * request route. So when dispatch is configured the row is left `pending` and a
 * GitHub Actions worker extracts it and writes back (the compose UI polls
 * `GET …/sources`); see `storySourceExtractDispatch`. With dispatch unset
 * (local dev) PDFs fall back to SYNCHRONOUS deterministic text extraction.
 * HTML/CSV/links/pasted text are always extracted synchronously here.
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

    const isPdf = f.name.toLowerCase().endsWith('.pdf') || mime.includes('pdf')

    const row = await insertStorySource({
      storySlug: slug,
      kind: 'file',
      filename: f.name,
      mime,
      status: 'pending',
    })

    // Persist the original to the bucket first — the async worker reads it back
    // from there, and the sync path re-extracts from it later.
    const storagePath = sourceStoragePath(slug, row.id, f.name)
    try {
      await uploadSourceFile(storagePath, buffer, mime)
      await updateStorySource(row.id, { storagePath })
    } catch (e) {
      const error = `upload failed: ${e instanceof Error ? e.message : String(e)}`
      await updateStorySource(row.id, { status: 'failed', error }).catch(() => {})
      return NextResponse.json({ ok: true, source: { ...row, status: 'failed', error } })
    }

    // ── PDFs → async Gemma worker (when configured) ──────────────────────────
    // Leave the row `pending` and hand off to a GitHub runner; the UI polls
    // until the worker flips it to extracted/failed.
    if (isPdf && isSourceExtractDispatchConfigured()) {
      try {
        await dispatchSourceExtractJob({ sourceId: row.id, slug })
        return NextResponse.json({ ok: true, source: { ...row, storagePath, status: 'pending' } })
      } catch (e) {
        const error = `extraction dispatch failed: ${e instanceof Error ? e.message : String(e)}`
        await updateStorySource(row.id, { status: 'failed', error }).catch(() => {})
        return NextResponse.json({ ok: true, source: { ...row, storagePath, status: 'failed', error } })
      }
    }

    // ── Everything else (and PDFs in local dev) → synchronous text extraction ─
    try {
      const { sources, failures } = await ingestSources({ files: [{ name: f.name, buffer }] })
      if (sources.length === 0) {
        const error = failures[0]?.reason ?? 'could not extract text'
        await updateStorySource(row.id, { status: 'failed', error })
        return NextResponse.json({ ok: true, source: { ...row, storagePath, status: 'failed', error } })
      }
      const s = sources[0]!
      const patch = {
        title: s.title,
        byline: s.byline ?? null,
        extractedText: s.body,
        status: 'extracted' as const,
      }
      await updateStorySource(row.id, patch)
      return NextResponse.json({ ok: true, source: { ...row, storagePath, ...patch } })
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
