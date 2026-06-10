import path from 'path'
import { extractBuffer, extractText, type ExtractedSource } from './extract'
import type { SourceDoc, IngestResult, IngestFailure } from '../types'

export { extract, extractBuffer, extractText, type ExtractedSource } from './extract'
// The vision PDF extractor is async-only (model-transcribed, seconds per page,
// unbounded on long PDFs) — used by the compose extraction worker, never inside
// `ingestSources` (which is synchronous).
export { extractPdfVision, type VisionPdfOptions } from './visionPdf'

/**
 * A browser-like User-Agent + Accept. Many sites 403 a bare server fetch (no
 * UA), which was the most common cause of "0 sources read". This makes link
 * ingestion behave like a normal reader.
 */
const FETCH_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/pdf,text/plain,*/*',
}

/** A file handed to the pipeline: raw bytes + the original filename (for its extension). */
export interface InputFile {
  name: string
  buffer: Buffer
}

/** A block of prose pasted straight into the composer (no URL, no file). */
export interface InputText {
  /** Raw text. The first line becomes the title (see `splitTitleAndByline`). */
  body: string
  /** Optional label for provenance; defaults to "Pasted text". */
  label?: string
}

export interface IngestInput {
  /** Public URLs to fetch and read. */
  links?: string[]
  /** Uploaded files (bytes + filename). */
  files?: InputFile[]
  /** Prose pasted directly into the composer. */
  texts?: InputText[]
}

/** Map a fetched response's content-type to an extractor extension. */
function extForContentType(contentType: string | null, url: string): string {
  const ct = (contentType ?? '').toLowerCase()
  if (ct.includes('application/pdf')) return '.pdf'
  if (ct.includes('text/csv')) return '.csv'
  if (ct.includes('application/json')) return '.json'
  if (ct.includes('text/markdown')) return '.md'
  if (ct.includes('text/plain')) return '.txt'
  // Fall back to the URL's own extension, then HTML for ordinary web pages.
  const urlExt = path.extname(new URL(url).pathname).toLowerCase()
  if (urlExt) return urlExt
  return '.html'
}

/**
 * Turn links + files into normalised `SourceDoc`s. Each source is tagged with
 * its origin so the research step can cite provenance. Failures are isolated and
 * REPORTED: one bad link/file does not sink the batch, but the caller learns
 * which sources were skipped and why (so a 0-source result is diagnosable).
 */
export async function ingestSources(input: IngestInput): Promise<IngestResult> {
  const sources: SourceDoc[] = []
  const failures: IngestFailure[] = []

  for (const link of input.links ?? []) {
    const url = link.trim()
    if (!url) continue
    try {
      const res = await fetch(url, { redirect: 'follow', headers: FETCH_HEADERS })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`.trim())
      const buf = Buffer.from(await res.arrayBuffer())
      const ext = extForContentType(res.headers.get('content-type'), url)
      const ex = await extractBuffer(buf, ext)
      if (!ex.body.trim()) throw new Error('no readable text could be extracted')
      sources.push(toDoc('link', url, ex))
    } catch (e) {
      failures.push({ origin: url, reason: e instanceof Error ? e.message : String(e) })
    }
  }

  for (const file of input.files ?? []) {
    const ext = path.extname(file.name).toLowerCase()
    try {
      const ex = await extractBuffer(file.buffer, ext)
      if (!ex.body.trim() && !ex.tables?.length) {
        throw new Error('file produced no readable text')
      }
      sources.push(toDoc('file', file.name, ex))
    } catch (e) {
      failures.push({ origin: file.name, reason: e instanceof Error ? e.message : String(e) })
    }
  }

  for (const text of input.texts ?? []) {
    const origin = text.label?.trim() || 'Pasted text'
    if (!text.body.trim()) continue
    try {
      const ex = await extractText(text.body)
      if (!ex.body.trim()) throw new Error('pasted text was empty')
      sources.push(toDoc('text', origin, ex))
    } catch (e) {
      failures.push({ origin, reason: e instanceof Error ? e.message : String(e) })
    }
  }

  return { sources, failures }
}

function toDoc(kind: SourceDoc['kind'], origin: string, ex: ExtractedSource): SourceDoc {
  return {
    origin,
    kind,
    title: ex.title,
    byline: ex.byline,
    body: ex.body,
    tables: ex.tables,
  }
}
