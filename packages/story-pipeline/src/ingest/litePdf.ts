/**
 * Local, deterministic PDF → markdown extraction via LiteParse
 * (`@llamaindex/liteparse`). This is the cheap, fast, in-process tier of the
 * compose extraction pipeline — it replaces the old `pdf-parse` text layer for
 * digital PDFs and, where the document has a real text layer, makes the slow
 * vision path (rasterise → Claude, see `visionPdf.ts`) unnecessary.
 *
 * How it differs from the two existing extractors:
 *   - vs `pdf-parse` (extract.ts): LiteParse reconstructs spatial layout into
 *     GitHub-flavored markdown — headings, lists, and ruled tables survive,
 *     instead of a flat, column-collapsed text dump.
 *   - vs vision (visionPdf.ts): no model call, no GitHub Actions worker, no
 *     per-page token cost. Pure PDFium text + heuristic grid projection, so it's
 *     milliseconds per page and runs synchronously inside the request.
 *
 * The trade-off LiteParse itself documents: it's rule-based, so scanned or
 * heavily graphical PDFs (no usable text layer) come out thin. We DON'T turn on
 * its bundled Tesseract OCR — it's slow and Claude vision transcribes those
 * documents far better. Instead {@link assessLiteExtraction} measures text
 * density and the caller escalates the thin ones to the vision worker. This is
 * the "LiteParse first, Claude only when needed" split.
 *
 * Native binding note: LiteParse ships prebuilt `.node` + `libpdfium.so` per
 * platform (linux-x64-gnu is present). On Vercel's Node runtime those files must
 * be traced into the function bundle; if the import fails we fall back to
 * `pdf-parse` (see `extractPdf` in extract.ts), so a tracing gap degrades
 * gracefully rather than 500-ing.
 */

import type { ExtractedSource } from './extract'

/** OCR off by design (see file header) — scanned PDFs escalate to vision. */
const OCR_ENABLED = false
/**
 * Cap pages so a pathologically long PDF can't stall the request. The vision
 * path caps at 12; LiteParse is ~1000× cheaper per page, so we can afford more
 * before truncating. Override with COMPOSE_PDF_LITE_MAX_PAGES.
 */
const MAX_PAGES = Number(process.env.COMPOSE_PDF_LITE_MAX_PAGES) || 50
/**
 * Escalation threshold: mean non-whitespace characters per page below which we
 * treat the document as scanned/graphical and hand it to the vision worker.
 * Digital PDFs observed in testing scored 360–2000; an image-only page scores
 * ~0. 80 leaves wide margin. Override with COMPOSE_PDF_LITE_MIN_DENSITY.
 */
const MIN_DENSITY = Number(process.env.COMPOSE_PDF_LITE_MIN_DENSITY) || 80

/** LiteParse's typed surface, narrowed to what this module uses. */
interface LiteParseModule {
  LiteParse: new (cfg?: {
    outputFormat?: 'json' | 'text' | 'markdown'
    ocrEnabled?: boolean
    imageMode?: 'off' | 'placeholder' | 'embed'
    extractLinks?: boolean
    maxPages?: number
    quiet?: boolean
  }) => {
    parse(input: Buffer | Uint8Array | string): Promise<{
      pages: Array<{ pageNum: number }>
      text: string
    }>
  }
}

export interface LiteExtractionAssessment {
  /** Mean non-whitespace characters per page. */
  density: number
  pageCount: number
  /** True when the extraction is too thin to trust — likely scanned/graphical. */
  shouldEscalate: boolean
}

export interface LiteExtractionResult {
  source: ExtractedSource
  assessment: LiteExtractionAssessment
}

/**
 * Parse a PDF to markdown with LiteParse and assess whether the result is rich
 * enough to use as-is. Never throws on a thin document — it returns the (sparse)
 * source plus `shouldEscalate: true` so the caller decides what to do. Throws
 * only if LiteParse itself can't load or parse (the caller's `pdf-parse`
 * fallback handles that).
 */
export async function extractPdfLite(
  buf: Buffer,
  opts: { label?: string } = {},
): Promise<LiteExtractionResult> {
  const mod = (await import('@llamaindex/liteparse')) as unknown as LiteParseModule
  const parser = new mod.LiteParse({
    outputFormat: 'markdown',
    ocrEnabled: OCR_ENABLED,
    imageMode: 'placeholder',
    extractLinks: true,
    maxPages: MAX_PAGES,
    quiet: true,
  })
  const res = await parser.parse(new Uint8Array(buf))
  const body = (res.text ?? '').trim()
  const pageCount = res.pages?.length || 0
  const assessment = assessLiteExtraction(body, pageCount)
  return {
    source: { title: deriveTitle(body, opts.label), body },
    assessment,
  }
}

/** Density = non-whitespace chars / page. Below MIN_DENSITY → escalate. */
export function assessLiteExtraction(body: string, pageCount: number): LiteExtractionAssessment {
  const nonWs = body.replace(/\s/g, '').length
  const density = pageCount > 0 ? Math.round(nonWs / pageCount) : nonWs
  return {
    density,
    pageCount,
    // An empty body, or text so sparse it's almost certainly an image-only
    // (scanned) document, should go to the vision model instead.
    shouldEscalate: nonWs === 0 || density < MIN_DENSITY,
  }
}

/**
 * First real text line (markdown heading or prose) → title; else the label.
 * Mirrors the vision path's `deriveTitle` so titles are consistent regardless of
 * which extractor produced the body: skip markdown images, heading hashes, and
 * table/rule rows so a logo or border never becomes the title.
 */
function deriveTitle(body: string, label?: string): string {
  for (const raw of body.split(/\r?\n/)) {
    const line = raw
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/^#+\s*/, '')
      .replace(/[*_`|]/g, '')
      .replace(/^[\s:-]+$/, '')
      .trim()
    if (line) return line.slice(0, 200)
  }
  return label?.replace(/\.[a-z0-9]+$/i, '') || 'Untitled'
}
