import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { ingestSources } from '@vismay/story-pipeline'
import {
  listStorySources,
  getStorySourceById,
  insertStorySource,
  updateStorySource,
  deleteStorySource,
  uploadSourceFile,
  removeSourceFile,
  downloadSourceFile,
  sourceStoragePath,
  type StorySource,
} from '@vismay/content-source/storySources'
import { createServiceClient } from '@vismay/content-source/supabase'
import {
  isSourceExtractDispatchConfigured,
  dispatchSourceExtractJob,
} from '@vismay/content-source/storySourceExtractDispatch'
import { ASSETS_BUCKET, guessContentType } from '@/lib/assetFiles'

/**
 * Compose stage 1 — add and extract a source for a draft.
 *
 * POST accepts either `multipart/form-data` with a `file`, or JSON `{ url }` /
 * `{ text }`. The original file is kept in the private `story-sources` bucket so
 * extraction can be re-run later; the extracted text lands on the `story_sources`
 * row. GET lists a draft's sources (node hydration); DELETE removes one.
 *
 * PDFs are read by a vision model (Claude Sonnet, Gemini fallback — rasterise
 * each page → markdown), which is far cleaner than the pdf-parse text layer for
 * graphical/financial/scanned PDFs but too slow for a request route on long
 * documents. So when dispatch is configured the row is left `pending` and a
 * GitHub Actions worker extracts it and writes back (the compose UI polls
 * `GET …/sources`); see `storySourceExtractDispatch`. With dispatch unset
 * (local dev) PDFs fall back to SYNCHRONOUS deterministic text extraction.
 * HTML/CSV/links/pasted text are always extracted synchronously here.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_FILE_BYTES = 15 * 1024 * 1024 // 15 MB

/**
 * Create + extract a `file` source from raw bytes: persist the original to the
 * private `story-sources` bucket (so extraction can be re-run), then PDFs go to
 * the async vision worker when configured (left `pending`), everything else is
 * extracted synchronously. Returns the row with its outcome reflected — expected
 * failures land as a `failed` status rather than throwing. Shared by the
 * multipart upload and the "from library" asset attach.
 */
async function createFileSource(
  slug: string,
  filename: string,
  mime: string,
  buffer: Buffer,
): Promise<StorySource> {
  const isPdf = filename.toLowerCase().endsWith('.pdf') || mime.includes('pdf')
  const row = await insertStorySource({ storySlug: slug, kind: 'file', filename, mime, status: 'pending' })

  const storagePath = sourceStoragePath(slug, row.id, filename)
  try {
    await uploadSourceFile(storagePath, buffer, mime)
    await updateStorySource(row.id, { storagePath })
  } catch (e) {
    const error = `upload failed: ${e instanceof Error ? e.message : String(e)}`
    await updateStorySource(row.id, { status: 'failed', error }).catch(() => {})
    return { ...row, status: 'failed', error }
  }

  if (isPdf && isSourceExtractDispatchConfigured()) {
    try {
      await dispatchSourceExtractJob({ sourceId: row.id, slug })
      return { ...row, storagePath, status: 'pending' }
    } catch (e) {
      const error = `extraction dispatch failed: ${e instanceof Error ? e.message : String(e)}`
      await updateStorySource(row.id, { status: 'failed', error }).catch(() => {})
      return { ...row, storagePath, status: 'failed', error }
    }
  }

  try {
    const { sources, failures } = await ingestSources({ files: [{ name: filename, buffer }] })
    if (sources.length === 0) {
      const error = failures[0]?.reason ?? 'could not extract text'
      await updateStorySource(row.id, { status: 'failed', error })
      return { ...row, storagePath, status: 'failed', error }
    }
    const s = sources[0]!
    const patch = {
      title: s.title,
      byline: s.byline ?? null,
      extractedText: s.body,
      status: 'extracted' as const,
    }
    await updateStorySource(row.id, patch)
    return { ...row, storagePath, ...patch }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await updateStorySource(row.id, { status: 'failed', error }).catch(() => {})
    return { ...row, storagePath, status: 'failed', error }
  }
}

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
    const source = await createFileSource(slug, f.name, mime, buffer)
    return NextResponse.json({ ok: true, source })
  }

  // ── Link / pasted text / library reference (JSON) ────────────────────────
  let body: { url?: string; text?: string; fromSourceId?: string; assetKey?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }

  const url = typeof body.url === 'string' ? body.url.trim() : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const fromSourceId = typeof body.fromSourceId === 'string' ? body.fromSourceId.trim() : ''
  const assetKey = typeof body.assetKey === 'string' ? body.assetKey.trim() : ''

  // ── From library: copy another draft's extracted source ──────────────────
  // Snapshot the already-extracted text into a fresh row for THIS draft. No
  // `storagePath` is copied — the row is a standalone snapshot, so deleting it
  // never touches the original's retained file.
  if (fromSourceId) {
    const src = await getStorySourceById(fromSourceId)
    if (!src || src.status !== 'extracted' || !src.extractedText) {
      return NextResponse.json({ error: 'source not available to copy' }, { status: 400 })
    }
    const row = await insertStorySource({
      storySlug: slug,
      kind: src.kind,
      filename: src.filename,
      sourceUrl: src.sourceUrl,
      mime: src.mime,
      title: src.title,
      byline: src.byline,
      extractedText: src.extractedText,
      status: 'extracted',
    })
    return NextResponse.json({ ok: true, source: row })
  }

  // ── From library: extract a document asset from the story-assets bucket ───
  if (assetKey) {
    const filename = assetKey.slice(assetKey.indexOf('/') + 1)
    if (!filename || !assetKey.includes('/')) {
      return NextResponse.json({ error: 'bad assetKey' }, { status: 400 })
    }
    let buffer: Buffer
    try {
      const sb = createServiceClient()
      const { data, error } = await sb.storage.from(ASSETS_BUCKET).download(assetKey)
      if (error || !data) throw new Error(error?.message ?? 'asset not found')
      buffer = Buffer.from(await data.arrayBuffer())
    } catch (e) {
      return NextResponse.json(
        { error: `could not read asset: ${e instanceof Error ? e.message : String(e)}` },
        { status: 502 },
      )
    }
    const source = await createFileSource(slug, filename, guessContentType(filename), buffer)
    return NextResponse.json({ ok: true, source })
  }

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

  return NextResponse.json(
    { error: 'provide a file, "url", "text", "fromSourceId", or "assetKey"' },
    { status: 400 },
  )
}

/**
 * Re-run extraction for a single source that previously `failed` (or to refresh
 * one). Body: `{ id }`. Reuses the same extraction branches as POST — files are
 * re-read from the retained `story-sources` original (PDFs re-dispatch the
 * vision worker when configured, else sync); links are re-fetched. Pasted text has
 * nothing to re-extract, so it's a no-op.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params

  let body: { id?: string }
  try {
    body = (await req.json()) as { id?: string }
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'missing "id"' }, { status: 400 })

  const row = (await listStorySources(slug)).find((s) => s.id === id)
  if (!row) return NextResponse.json({ error: 'source not found' }, { status: 404 })

  // ── File: re-read the retained original from the bucket ────────────────────
  if (row.kind === 'file') {
    if (!row.storagePath) {
      return NextResponse.json({ error: 'no stored original to re-extract' }, { status: 400 })
    }
    let buffer: Buffer
    try {
      buffer = Buffer.from(await downloadSourceFile(row.storagePath))
    } catch (e) {
      const error = `could not read stored file: ${e instanceof Error ? e.message : String(e)}`
      await updateStorySource(row.id, { status: 'failed', error }).catch(() => {})
      return NextResponse.json({ ok: true, source: { ...row, status: 'failed', error } })
    }
    const filename = row.filename ?? 'source'
    const mime = row.mime ?? 'application/octet-stream'
    const isPdf = filename.toLowerCase().endsWith('.pdf') || mime.includes('pdf')

    if (isPdf && isSourceExtractDispatchConfigured()) {
      try {
        await updateStorySource(row.id, { status: 'pending', error: null })
        await dispatchSourceExtractJob({ sourceId: row.id, slug })
        return NextResponse.json({ ok: true, source: { ...row, status: 'pending', error: null } })
      } catch (e) {
        const error = `extraction dispatch failed: ${e instanceof Error ? e.message : String(e)}`
        await updateStorySource(row.id, { status: 'failed', error }).catch(() => {})
        return NextResponse.json({ ok: true, source: { ...row, status: 'failed', error } })
      }
    }

    try {
      const { sources, failures } = await ingestSources({ files: [{ name: filename, buffer }] })
      if (sources.length === 0) {
        const error = failures[0]?.reason ?? 'could not extract text'
        await updateStorySource(row.id, { status: 'failed', error })
        return NextResponse.json({ ok: true, source: { ...row, status: 'failed', error } })
      }
      const s = sources[0]!
      const patch = {
        title: s.title,
        byline: s.byline ?? null,
        extractedText: s.body,
        status: 'extracted' as const,
        error: null,
      }
      await updateStorySource(row.id, patch)
      return NextResponse.json({ ok: true, source: { ...row, ...patch } })
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      await updateStorySource(row.id, { status: 'failed', error }).catch(() => {})
      return NextResponse.json({ ok: true, source: { ...row, status: 'failed', error } })
    }
  }

  // ── Link: re-fetch + re-extract ────────────────────────────────────────────
  if (row.kind === 'link' && row.sourceUrl) {
    try {
      const { sources, failures } = await ingestSources({ links: [row.sourceUrl] })
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
        error: null,
      }
      await updateStorySource(row.id, patch)
      return NextResponse.json({ ok: true, source: { ...row, ...patch } })
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      await updateStorySource(row.id, { status: 'failed', error }).catch(() => {})
      return NextResponse.json({ ok: true, source: { ...row, status: 'failed', error } })
    }
  }

  // ── Pasted text: nothing to re-extract ─────────────────────────────────────
  return NextResponse.json({ error: 'this source has no original to re-extract' }, { status: 400 })
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
