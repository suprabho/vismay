import path from 'path'
import { extractBuffer, type ExtractedSource } from './extract'
import type { SourceDoc } from '../types'

export { extract, extractBuffer, type ExtractedSource } from './extract'

/** A file handed to the pipeline: raw bytes + the original filename (for its extension). */
export interface InputFile {
  name: string
  buffer: Buffer
}

export interface IngestInput {
  /** Public URLs to fetch and read. */
  links?: string[]
  /** Uploaded files (bytes + filename). */
  files?: InputFile[]
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
 * its origin so the research step can cite provenance. Failures are isolated:
 * one bad link/file does not sink the whole batch — it's skipped (the caller
 * sees fewer sources, not an error).
 */
export async function ingestSources(input: IngestInput): Promise<SourceDoc[]> {
  const docs: SourceDoc[] = []

  for (const link of input.links ?? []) {
    const url = link.trim()
    if (!url) continue
    try {
      const res = await fetch(url, { redirect: 'follow' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      const ext = extForContentType(res.headers.get('content-type'), url)
      const ex = await extractBuffer(buf, ext)
      docs.push(toDoc('link', url, ex))
    } catch {
      // skip unreachable / unparseable link
    }
  }

  for (const file of input.files ?? []) {
    const ext = path.extname(file.name).toLowerCase()
    try {
      const ex = await extractBuffer(file.buffer, ext)
      docs.push(toDoc('file', file.name, ex))
    } catch {
      // skip unsupported / corrupt file
    }
  }

  return docs
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
