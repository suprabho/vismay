/**
 * markitdown extraction — convert a source document to clean GitHub-flavored
 * Markdown via Microsoft's `markitdown` CLI (https://github.com/microsoft/markitdown).
 *
 * Why a Python subprocess and not a TS library: markitdown is the most capable
 * open converter for Office formats (Word/PowerPoint/Excel) — which the
 * deterministic `extract.ts` path can't read at all — and produces cleaner
 * Markdown (tables especially) than our hand-rolled HTML/PDF paths. It is
 * Python-only, so it runs solely where the CLI is installed: the compose
 * extraction WORKER (`apps/admin/scripts/extract-compose-source.ts` and its
 * workflow), never inside the synchronous Next route.
 *
 * For PDFs markitdown reads the *text layer* (pdfminer) — same class of tool as
 * pdf-parse — so a scanned or heavily graphical PDF yields little or no text.
 * The worker detects that sparse output and falls back to the vision
 * transcriber (`extractPdfVision`); markitdown does NOT replace that path.
 */

import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { ExtractedSource } from './extract'

const execFileAsync = promisify(execFile)

/** CLI binary; override with MARKITDOWN_BIN (e.g. an absolute venv path). */
const MARKITDOWN_BIN = process.env.MARKITDOWN_BIN || 'markitdown'

/**
 * Extensions markitdown reads better than — or that are missing entirely from —
 * the deterministic TS extractor. HTML/CSV/JSON/text are deliberately excluded:
 * the synchronous `extractBuffer` path handles those well and instantly. PDFs
 * are included for the text-layer path; the caller adds the vision fallback.
 */
export const MARKITDOWN_EXTS = new Set<string>([
  '.pdf',
  '.docx',
  '.doc',
  '.pptx',
  '.ppt',
  '.xlsx',
  '.xls',
  '.epub',
])

/** True if `filename`'s extension is one markitdown should handle. */
export function isMarkitdownExt(filename: string): boolean {
  return MARKITDOWN_EXTS.has(path.extname(filename).toLowerCase())
}

let availability: Promise<boolean> | null = null
/**
 * Whether the `markitdown` CLI is callable in this environment. Probed once and
 * cached — a missing binary is the expected case in local dev / the Next route.
 */
export function isMarkitdownAvailable(): Promise<boolean> {
  if (!availability) {
    availability = execFileAsync(MARKITDOWN_BIN, ['--version'])
      .then(() => true)
      .catch(() => false)
  }
  return availability
}

export interface MarkitdownOptions {
  /**
   * Original filename/label. Its extension tells markitdown how to sniff the
   * input, and the basename is the title fallback when no heading is found.
   */
  label?: string
  /** Max stdout/stderr buffer for the child process (bytes). Default 16 MB. */
  maxBuffer?: number
}

/**
 * Convert a document buffer to Markdown with markitdown. Writes the bytes to a
 * temp file (markitdown sniffs by extension + content) and reads the converted
 * Markdown back via `-o`. Throws if the CLI is missing/errors or yields no text
 * — so the worker can mark the source `failed` (or fall back to vision).
 */
export async function extractWithMarkitdown(
  buf: Buffer,
  opts: MarkitdownOptions = {},
): Promise<ExtractedSource> {
  const ext = opts.label ? path.extname(opts.label).toLowerCase() : ''
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'markitdown-'))
  const inPath = path.join(dir, `src${ext || '.bin'}`)
  const outPath = path.join(dir, 'out.md')
  try {
    await fs.writeFile(inPath, buf)
    await execFileAsync(MARKITDOWN_BIN, [inPath, '-o', outPath], {
      maxBuffer: opts.maxBuffer ?? 16 * 1024 * 1024,
    })
    const body = (await fs.readFile(outPath, 'utf8')).trim()
    if (!body) throw new Error('markitdown produced no text')
    return { title: deriveTitle(body, opts.label), body }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
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
