import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { ingestSources, extractPdfLite } from '@vismay/story-pipeline'
import {
  listStorySources,
  getStorySourceById,
  insertStorySource,
  updateStorySource,
  deleteStorySource,
  uploadSourceFile,
  signSourceUpload,
  removeSourceFile,
  downloadSourceFile,
  sourceStoragePath,
  type StorySource,
  type StorySourcePatch,
} from '@vismay/content-source/storySources'
import { createServiceClient } from '@vismay/content-source/supabase'
import {
  isSourceExtractDispatchConfigured,
  dispatchSourceExtractJob,
} from '@vismay/content-source/storySourceExtractDispatch'
import { ASSETS_BUCKET, guessContentType } from '@/lib/assetFiles'
import { extractLibraryItem } from '@/lib/libraryProviders'

/**
 * Compose stage 1 — add and extract a source for a draft.
 *
 * POST accepts `multipart/form-data` with a `file` (small files), or JSON:
 * `{ url }`, `{ text }`, a library reference, or `{ signUpload }` (large files —
 * see below). The original file is kept in the private `story-sources` bucket so
 * extraction can be re-run later; the extracted text lands on the `story_sources`
 * row. GET lists a draft's sources (node hydration); DELETE removes one.
 *
 * PDF extraction is a hybrid (see `extractFileRow`): LiteParse runs first —
 * local, fast, free, markdown-preserving — and only scanned/graphical PDFs with
 * no usable text layer escalate to the vision worker (Claude Sonnet, Gemini
 * fallback) when dispatch is configured, leaving the row `pending` while a
 * GitHub Actions worker writes back (the compose UI polls `GET …/sources`); see
 * `storySourceExtractDispatch`. HTML/CSV/links/pasted text extract synchronously.
 *
 * Large files: Vercel rejects request bodies over ~4.5 MB (plain-text 413), so
 * multi-MB PDFs can't be proxied through the multipart path. The client posts
 * `{ signUpload: { filename, mime } }` to get a signed URL, PUTs the file
 * straight to the bucket, then calls PATCH `{ id }` to trigger extraction.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_FILE_BYTES = 15 * 1024 * 1024 // 15 MB

/** Persisted outcome of an extraction run, spread onto the row for the reply. */
type ExtractPatch = StorySourcePatch & { status: StorySource['status'] }

function isPdfFile(filename: string, mime: string): boolean {
  return filename.toLowerCase().endsWith('.pdf') || mime.includes('pdf')
}

/**
 * Extract an already-stored file row from its bytes and persist the result.
 * The single extraction code path shared by the multipart upload, the "from
 * library" asset attach, the large-file direct-upload trigger, and re-extract.
 *
 * PDF strategy is a hybrid: LiteParse first — local, fast (~ms/page), free, and
 * it keeps headings/tables as markdown — and only the THIN results
 * (scanned/graphical PDFs with no usable text layer) escalate to the async
 * Claude vision worker. So most PDFs never touch a model or a GitHub runner.
 * Kill-switch: COMPOSE_PDF_LITEPARSE=0 skips LiteParse without a code change.
 * Returns a patch (already written to the DB) rather than throwing — expected
 * failures land as `status: 'failed'`.
 */
async function extractFileRow(
  rowId: string,
  slug: string,
  filename: string,
  mime: string,
  buffer: Buffer,
): Promise<ExtractPatch> {
  const applyExtracted = async (s: {
    title: string
    byline?: string
    body: string
  }): Promise<ExtractPatch> => {
    const patch: ExtractPatch = {
      title: s.title,
      byline: s.byline ?? null,
      extractedText: s.body,
      status: 'extracted',
      error: null,
    }
    await updateStorySource(rowId, patch)
    return patch
  }
  const dispatchToWorker = async (): Promise<ExtractPatch> => {
    try {
      await dispatchSourceExtractJob({ sourceId: rowId, slug })
      await updateStorySource(rowId, { status: 'pending', error: null })
      return { status: 'pending', error: null }
    } catch (e) {
      const error = `extraction dispatch failed: ${e instanceof Error ? e.message : String(e)}`
      await updateStorySource(rowId, { status: 'failed', error }).catch(() => {})
      return { status: 'failed', error }
    }
  }

  const isPdf = isPdfFile(filename, mime)
  if (isPdf && process.env.COMPOSE_PDF_LITEPARSE !== '0') {
    try {
      const { source, assessment } = await extractPdfLite(buffer, { label: filename })
      if (!assessment.shouldEscalate && source.body.trim()) return applyExtracted(source)
      // Thin extraction → the vision worker when configured; otherwise keep
      // LiteParse's best effort (local dev) before falling to pdf-parse below.
      if (isSourceExtractDispatchConfigured()) return dispatchToWorker()
      if (source.body.trim()) return applyExtracted(source)
    } catch {
      // LiteParse native binding unavailable / parse error — fall through.
    }
  }
  if (isPdf && isSourceExtractDispatchConfigured()) return dispatchToWorker()

  try {
    const { sources, failures } = await ingestSources({ files: [{ name: filename, buffer }] })
    if (sources.length === 0) {
      const error = failures[0]?.reason ?? 'could not extract text'
      await updateStorySource(rowId, { status: 'failed', error })
      return { status: 'failed', error }
    }
    return applyExtracted(sources[0]!)
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await updateStorySource(rowId, { status: 'failed', error }).catch(() => {})
    return { status: 'failed', error }
  }
}

/**
 * Create + extract a `file` source from raw bytes: persist the original to the
 * private `story-sources` bucket (so extraction can be re-run), then run the
 * shared {@link extractFileRow}. Returns the row with its outcome reflected.
 * Used by the (small-file) multipart upload and the "from library" asset attach;
 * large files take the direct-to-storage `signUpload` path instead.
 */
async function createFileSource(
  slug: string,
  filename: string,
  mime: string,
  buffer: Buffer,
): Promise<StorySource> {
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
  const patch = await extractFileRow(row.id, slug, filename, mime, buffer)
  return { ...row, storagePath, ...patch }
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
  let body: {
    url?: string
    text?: string
    fromSourceId?: string
    assetKey?: string
    providerKey?: string
    itemId?: string
    signUpload?: { filename?: string; mime?: string }
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }

  // ── Large file: hand back a signed URL so the browser uploads STRAIGHT to
  // the story-sources bucket, bypassing this function. Vercel rejects request
  // bodies over ~4.5 MB with a plain-text 413, so multi-MB PDFs can't be
  // proxied through the multipart path above. We create the row + storagePath
  // now; the client PUTs the file to `signedUrl`, then calls PATCH { id } to
  // run extraction from the stored original (same as re-extract). ───────────
  if (body.signUpload && typeof body.signUpload === 'object') {
    const filename = typeof body.signUpload.filename === 'string' ? body.signUpload.filename.trim() : ''
    if (!filename) return NextResponse.json({ error: 'signUpload requires "filename"' }, { status: 400 })
    const mime =
      typeof body.signUpload.mime === 'string' && body.signUpload.mime
        ? body.signUpload.mime
        : guessContentType(filename)
    const row = await insertStorySource({ storySlug: slug, kind: 'file', filename, mime, status: 'pending' })
    const storagePath = sourceStoragePath(slug, row.id, filename)
    try {
      const { signedUrl } = await signSourceUpload(storagePath)
      await updateStorySource(row.id, { storagePath })
      return NextResponse.json({
        ok: true,
        source: { ...row, storagePath },
        upload: { signedUrl, contentType: mime },
      })
    } catch (e) {
      const error = `could not sign upload: ${e instanceof Error ? e.message : String(e)}`
      await updateStorySource(row.id, { status: 'failed', error }).catch(() => {})
      return NextResponse.json({ error }, { status: 500 })
    }
  }

  const url = typeof body.url === 'string' ? body.url.trim() : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const fromSourceId = typeof body.fromSourceId === 'string' ? body.fromSourceId.trim() : ''
  const assetKey = typeof body.assetKey === 'string' ? body.assetKey.trim() : ''
  const providerKey = typeof body.providerKey === 'string' ? body.providerKey.trim() : ''
  const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : ''

  // ── From library: a provider item (published story, epic, …) ─────────────
  // The provider extracts plain text; we snapshot it as a `text` row, so it
  // flows into angles/outline like any pasted source.
  if (providerKey && itemId) {
    const extracted = await extractLibraryItem(providerKey, itemId)
    if (!extracted) {
      return NextResponse.json({ error: 'library item not available' }, { status: 400 })
    }
    const row = await insertStorySource({
      storySlug: slug,
      kind: 'text',
      title: extracted.title,
      byline: extracted.byline ?? null,
      extractedText: extracted.text,
      status: 'extracted',
    })
    return NextResponse.json({ ok: true, source: row })
  }

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
    {
      error:
        'provide a file, "url", "text", "fromSourceId", "assetKey", or "providerKey"+"itemId"',
    },
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

  // ── File: re-read the retained original from the bucket, then extract. Also
  // the completion step for the large-file `signUpload` flow — once the browser
  // has PUT the file straight to storage, this downloads it and runs the same
  // hybrid extraction as every other file path. ─────────────────────────────
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
    const patch = await extractFileRow(row.id, slug, filename, mime, buffer)
    return NextResponse.json({ ok: true, source: { ...row, ...patch } })
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
