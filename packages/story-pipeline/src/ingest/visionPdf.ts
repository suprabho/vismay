/**
 * Vision-based PDF extraction — rasterise each page and have a vision model
 * (Claude Sonnet, falling back to Gemini per page) transcribe it to clean
 * GitHub-flavored markdown.
 *
 * Why this exists: the deterministic `pdf-parse` text layer (see `extract.ts`)
 * mangles graphical/financial PDFs — column order collapses, glyphs come out as
 * gibberish ("AEuduring Valtll:'"). For the compose source-extraction path,
 * clean source text matters, so PDFs are read by a model instead. pdf-parse is
 * still used here, but only as the rasteriser (`getScreenshot`, which renders
 * via @napi-rs/canvas — hence the same `DOMMatrix` polyfill the text path
 * needs).
 *
 * Synchronous, in-process (runs inside the compose POST route). Pages are
 * transcribed with bounded concurrency and the page count is capped so a long
 * PDF can't blow past the route's function-duration limit; truncation is
 * reported, never silent.
 */

import { generateText } from '@vismay/ai-gateway'
import { ensureCanvasGlobals } from './extract'
import type { ExtractedSource } from './extract'

/** Max pages transcribed per PDF. Override with COMPOSE_PDF_VISION_MAX_PAGES. */
const MAX_PAGES = Number(process.env.COMPOSE_PDF_VISION_MAX_PAGES) || 12
/** Concurrent page transcriptions — balances wall-clock vs the 120s route cap. */
const CONCURRENCY = Number(process.env.COMPOSE_PDF_VISION_CONCURRENCY) || 3
/** Render scale; 2× gives the model enough resolution for dense table text. */
const SCALE = 2
/** Per-page output budget — a dense financial page can run long. */
const MAX_TOKENS_PER_PAGE = 6000
/** Primary transcription model — Claude Sonnet (vision-capable). */
const PRIMARY_MODEL = 'text.claude'
/**
 * Per-page fallback when the primary call fails — Gemini, a different provider
 * lineage, so a Claude outage or refusal doesn't sink the whole extraction.
 */
const FALLBACK_MODEL = 'text.pro'

const PAGE_PROMPT =
  'Transcribe this single document page to clean GitHub-flavored markdown. ' +
  'Preserve every heading, label, and number exactly as printed. Render tabular ' +
  'data as markdown tables, keeping columns aligned to their headers. Do not ' +
  'summarise, reorder, interpret, or add any commentary — output only the ' +
  'verbatim transcription. If the page is blank, output nothing.'

interface ShotPage {
  data: Uint8Array
  pageNumber: number
}

/** pdf-parse 2.x surface we use — narrowed to the two calls this module makes. */
interface PdfParseModule {
  PDFParse: new (opts: { data: Uint8Array }) => {
    getInfo(): Promise<{ total?: number }>
    getScreenshot(params: {
      first?: number
      scale?: number
      imageBuffer?: boolean
      imageDataUrl?: boolean
    }): Promise<{ pages: ShotPage[] }>
    destroy(): Promise<void>
  }
}

export interface VisionPdfOptions {
  /** Filename/label, used as a title fallback when the page has no heading. */
  label?: string
  /**
   * Model alias or gateway id. Defaults to Claude Sonnet with a per-page
   * Gemini fallback; passing an explicit model disables the fallback.
   */
  model?: string
}

/**
 * Extract a PDF's text by rasterising its pages and transcribing each with a
 * vision model. Throws if no page yields any text (so the caller marks the
 * source `failed`, same as the text path).
 */
export async function extractPdfVision(
  buf: Buffer,
  opts: VisionPdfOptions = {},
): Promise<ExtractedSource> {
  await ensureCanvasGlobals()
  const mod = (await import('pdf-parse')) as unknown as PdfParseModule

  // Page count first (cheap), on its own parser instance — the PDF worker
  // transfers the buffer on use, so each operation gets a fresh Uint8Array.
  const info = new mod.PDFParse({ data: new Uint8Array(buf) })
  let total: number
  try {
    total = (await info.getInfo()).total ?? 0
  } finally {
    await info.destroy().catch(() => {})
  }

  const take = total > 0 ? Math.min(total, MAX_PAGES) : MAX_PAGES
  const shooter = new mod.PDFParse({ data: new Uint8Array(buf) })
  let pages: ShotPage[]
  try {
    const shot = await shooter.getScreenshot({
      first: take,
      scale: SCALE,
      imageBuffer: true,
      imageDataUrl: false,
    })
    pages = shot.pages
  } finally {
    await shooter.destroy().catch(() => {})
  }
  if (!pages.length) throw new Error('could not rasterise any page')

  const model = opts.model ?? PRIMARY_MODEL
  const fallback = opts.model ? null : FALLBACK_MODEL
  const transcripts = new Array<string>(pages.length)

  async function transcribePage(withModel: string, b64: string): Promise<string> {
    const { result } = await generateText({
      model: withModel,
      prompt: PAGE_PROMPT,
      images: [{ data: b64, mimeType: 'image/png' }],
      maxOutputTokens: MAX_TOKENS_PER_PAGE,
      metadata: { feature: 'compose-pdf-vision' },
    })
    return (result as string).trim()
  }

  // Bounded-concurrency worker pool over the page list, preserving page order.
  let next = 0
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++
      if (i >= pages.length) return
      const page = pages[i]!
      const b64 = Buffer.from(page.data).toString('base64')
      try {
        transcripts[i] = await transcribePage(model, b64)
      } catch (e) {
        if (!fallback) throw e
        transcripts[i] = await transcribePage(fallback, b64)
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, pages.length) }, () => worker()),
  )

  const truncated = total > take
  const body = transcripts
    .filter((t) => t)
    .join('\n\n')
    .concat(
      truncated
        ? `\n\n_[Transcription truncated: first ${take} of ${total} pages.]_`
        : '',
    )
    .trim()
  if (!body) throw new Error('vision transcription produced no text')

  return { title: deriveTitle(body, opts.label), body }
}

/** First real text line (markdown heading or prose) → title; else the label. */
function deriveTitle(body: string, label?: string): string {
  for (const raw of body.split(/\r?\n/)) {
    // Drop markdown images (`![alt](src)`) and table/rule rows — a logo or
    // table border shouldn't become the title.
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
