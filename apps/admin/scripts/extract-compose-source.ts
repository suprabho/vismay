/**
 * Async compose-source extractor — the GitHub Actions worker.
 *
 * Reads a `story_sources` row (a document uploaded in the compose flow),
 * downloads the original from the private `story-sources` bucket, extracts it to
 * Markdown, and writes the result back onto the row (`status: extracted` +
 * `extracted_text`, or `status: failed` + `error`). The compose UI polls
 * `GET …/sources` and re-enables "Generate angles" once the row flips to
 * `extracted`.
 *
 * Extraction strategy (see `extractSource`):
 *   - Office / EPub / text-layer PDFs → markitdown (Python CLI → Markdown).
 *   - Scanned / graphical PDFs → markitdown's text layer comes back sparse, so
 *     we fall back to the vision transcriber (Claude Sonnet, Gemini fallback —
 *     rasterise each page → markdown).
 *
 * Why a worker and not a request route: markitdown is Python (not installable in
 * the Next runtime) and a multi-page PDF's page-by-page vision transcription can
 * blow past serverless function limits. A GitHub runner has no such cap and
 * `pip install`s markitdown (see render-video.yml — same dispatch lane).
 *
 *   pnpm exec tsx scripts/extract-compose-source.ts <source_id> [<source_id> …]
 *   pnpm exec tsx scripts/extract-compose-source.ts --all-pending
 *
 * Env (set by the workflow's `env:` block in CI; loaded from apps/admin/.env
 * locally): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * AI_GATEWAY_API_KEY.
 */

import fs from 'fs'
import path from 'path'
import {
  getStorySourceById,
  listStorySourcesByStatus,
  updateStorySource,
  downloadSourceFile,
  type StorySource,
} from '@vismay/content-source/storySources'
import {
  extractPdfVision,
  extractWithMarkitdown,
  isMarkitdownExt,
  isMarkitdownAvailable,
  type ExtractedSource,
} from '@vismay/story-pipeline'

/**
 * Below this many characters, a PDF's markitdown text layer is treated as
 * scanned/graphical and re-extracted with the vision transcriber. Override with
 * COMPOSE_PDF_TEXT_MIN_CHARS.
 */
const MIN_PDF_TEXT_CHARS = Number(process.env.COMPOSE_PDF_TEXT_MIN_CHARS) || 200

function isPdf(filename?: string): boolean {
  return Boolean(filename && filename.toLowerCase().endsWith('.pdf'))
}

/**
 * Extract a downloaded source to Markdown. markitdown handles Office/EPub and
 * the PDF text layer; the vision transcriber is the fallback for scanned or
 * graphical PDFs (where markitdown yields little/no text) and whenever
 * markitdown is unavailable.
 */
async function extractSource(buf: Buffer, filename?: string): Promise<ExtractedSource> {
  const pdf = isPdf(filename)
  const useMarkitdown =
    Boolean(filename) && isMarkitdownExt(filename!) && (await isMarkitdownAvailable())

  if (useMarkitdown) {
    try {
      const ex = await extractWithMarkitdown(buf, { label: filename })
      if (pdf && ex.body.length < MIN_PDF_TEXT_CHARS) {
        console.log(
          `  markitdown text layer sparse (${ex.body.length} chars) — falling back to vision`,
        )
        return extractPdfVision(buf, { label: filename })
      }
      return ex
    } catch (e) {
      // A markitdown failure on a PDF is recoverable via vision; on other
      // formats there's nothing else to try, so surface the error.
      if (!pdf) throw e
      console.log(
        `  markitdown failed (${e instanceof Error ? e.message : e}) — falling back to vision`,
      )
      return extractPdfVision(buf, { label: filename })
    }
  }

  // No markitdown (e.g. not installed): PDFs still extract via vision; other
  // formats can't be handled here — they should have gone the synchronous route.
  if (pdf) return extractPdfVision(buf, { label: filename })
  throw new Error(`markitdown unavailable; cannot extract ${filename ?? 'file'}`)
}

/** Best-effort .env load for local runs; a no-op in CI where env is preset. */
function loadLocalEnv(): void {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2]!.trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[m[1]!]) process.env[m[1]!] = v
  }
}

async function extractOne(src: StorySource): Promise<void> {
  const label = `${src.id} (${src.filename ?? src.kind})`
  if (!src.storagePath) {
    await updateStorySource(src.id, { status: 'failed', error: 'no stored file to extract' })
    console.error(`✗ ${label}: no storagePath`)
    return
  }
  console.log(`→ ${label}: downloading…`)
  try {
    const bytes = await downloadSourceFile(src.storagePath)
    console.log(`→ ${label}: extracting ${bytes.length} bytes…`)
    const ex = await extractSource(Buffer.from(bytes), src.filename ?? undefined)
    await updateStorySource(src.id, {
      title: ex.title,
      byline: ex.byline ?? null,
      extractedText: ex.body,
      status: 'extracted',
      error: null, // clear any stale failure message from a prior attempt
    })
    console.log(`✓ ${label}: extracted ${ex.body.length} chars — "${ex.title.slice(0, 60)}"`)
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await updateStorySource(src.id, { status: 'failed', error }).catch(() => {})
    console.error(`✗ ${label}: ${error}`)
    throw e
  }
}

async function main(): Promise<void> {
  loadLocalEnv()
  const args = process.argv.slice(2)
  if (!args.length) {
    console.error('usage: extract-compose-source.ts <source_id> [<source_id> …] | --all-pending')
    process.exit(2)
  }

  let sources: StorySource[]
  if (args[0] === '--all-pending') {
    sources = await listStorySourcesByStatus('pending')
    console.log(`found ${sources.length} pending source(s)`)
  } else {
    const rows = await Promise.all(args.map((id) => getStorySourceById(id)))
    sources = rows.filter((r): r is StorySource => {
      if (!r) console.error(`(skip) unknown source id`)
      return Boolean(r)
    })
  }

  let failed = 0
  // Serial: the runner has no time limit and serial keeps gateway load + logs
  // sane. Each source is isolated — one failure doesn't sink the batch.
  for (const src of sources) {
    try {
      await extractOne(src)
    } catch {
      failed++
    }
  }
  console.log(`done: ${sources.length - failed}/${sources.length} extracted`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error('fatal:', e instanceof Error ? e.message : e)
  process.exit(1)
})
