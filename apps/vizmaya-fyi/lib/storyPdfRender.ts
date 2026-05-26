/**
 * Server-side: render a story as a portrait booklet (`format='report'`) or a
 * 16:9 slide deck (`format='slides'`) PDF.
 *
 * Mirrors lib/storyVideoRender.ts but simpler: no audio, no ffmpeg, no
 * scroll-walking. Just goto + waitForFunction + page.pdf().
 *
 * Imports `playwright`, so this module can only run in a Node runtime
 * (Next.js API routes with `runtime = 'nodejs'`, scripts under `tsx`). Do
 * not import from a Client Component or an Edge route handler.
 *
 * Caller responsibilities:
 *   - Pass a Supabase service-role client (RLS would block writes).
 *   - Provide a `baseUrl` reachable from the headless browser (e.g.
 *     `http://localhost:3000` in dev).
 *   - Ensure Playwright Chromium is installed (`npx playwright install chromium`).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { signOutputUrl } from '@vismay/admin-core/signedUrl'
import { getContentSource } from '@vismay/content-source/contentSource'
import {
  computeContentRevisionHash,
  getCachedPdf,
  PDF_BUCKET,
  type PdfFormat,
} from '@vismay/content-source/storyPdf'

/**
 * Per-format render config. Letter portrait for the report; 1920×1080 fixed
 * for slides so each slide is exactly one PDF page at 16:9. Viewport ==
 * physical paper size in CSS px (96dpi) so layouts render at print size in
 * the headless browser, no scaling required.
 */
const RENDER_CONFIG: Record<
  PdfFormat,
  {
    viewport: { width: number; height: number }
    pdfArgs: {
      width?: string
      height?: string
      format?: 'A4'
      landscape?: boolean
    }
  }
> = {
  report: {
    viewport: { width: 794, height: 1123 }, // A4 (210×297mm) @ 96dpi
    pdfArgs: { format: 'A4', landscape: false },
  },
  slides: {
    viewport: { width: 1920, height: 1080 },
    pdfArgs: { width: '1920px', height: '1080px', landscape: true },
  },
}

// How long Playwright waits for window.__pdfReady__ before giving up.
//
// This must outlast the WORST CASE of the in-page readiness coordinator
// (storyReadiness.ts), not just its FALLBACK_TIMEOUT_MS (120_000). The
// fallback timer is armed inside a React useEffect — i.e. only once the
// shell has hydrated — and a large deck mounts one map + chart per slide,
// so hydration alone can take tens of seconds on a GitHub Actions runner.
// The flag therefore flips at roughly (hydration + 120s); a fixed 150s
// budget left almost no hydration headroom and timed out on long decks
// before the fallback could rescue the capture.
//
// 5 minutes covers a slow hydrate + the 120s settle/fallback with room to
// spare, and still sits comfortably under the workflow's 15-minute job cap
// (render-pdf.yml) so a genuinely stuck render still fails loudly rather
// than hanging the runner.
const READY_TIMEOUT_MS = 300_000

export interface RenderResult {
  public_url: string
  cached: boolean
  content_revision_hash: string
}

interface PdfRenderResult {
  pdfBuffer: Buffer
  thumbnailBuffer: Buffer | null
}

async function renderPdfBuffer(args: {
  slug: string
  format: PdfFormat
  baseUrl: string
  log: (msg: string) => void
}): Promise<PdfRenderResult> {
  const cfg = RENDER_CONFIG[args.format]

  const browser = await chromium.launch({
    args: [
      '--disable-blink-features=AutomationControlled',
      // Chromium caps simultaneous WebGL contexts at 16 by default. Slide
      // decks and reports mount one Mapbox canvas per page, eagerly, so the
      // headless capture can rasterize them in a single page.pdf() pass —
      // 17+ maps on a single story silently evicts the oldest contexts and
      // those slides render with no tile imagery (only DOM pin markers
      // survive). Bumping the cap to 64 covers the longest stories we have
      // without changing memory behaviour for shorter ones.
      '--max-active-webgl-contexts=64',
    ],
  })
  try {
    const context = await browser.newContext({
      viewport: cfg.viewport,
      deviceScaleFactor: 1,
      // Force animations to actually run — share-card capture / chart
      // entrances rely on this in some setups.
      reducedMotion: 'no-preference',
    })

    const page = await context.newPage()

    // Surface runtime exceptions and GL/WebGL warnings to the runner stdout.
    // Per-map readiness logging is gone (567c865-era instrumentation) now
    // that --max-active-webgl-contexts removes the eviction race; keep this
    // narrow tap so a future regression doesn't disappear behind a
    // Playwright timeout.
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        args.log(`page.${msg.type()}: ${msg.text()}`)
      }
    })
    page.on('pageerror', (err) => {
      args.log(`pageerror: ${err.message}`)
    })

    // The /story/<slug>/<format> route is gated by signed-URL middleware.
    // Mint a short-lived HMAC token (5 min — plenty for one render) and
    // append it to the URL Playwright navigates to. Same secret is used by
    // the consumer middleware to verify.
    const url = signOutputUrl({
      baseUrl: args.baseUrl,
      // Cover the whole render: the token gates the initial navigation and any
      // in-page fetches (chart data) the shell fires while we wait for
      // __pdfReady__. A short TTL could expire mid-render on a long deck now
      // that READY_TIMEOUT_MS is minutes; keep it just under the job cap.
      ttlSeconds: 14 * 60,
      query: { print: '1' },
    })
    args.log(`navigating: ${url}`)
    // `domcontentloaded`, not `load`: in print mode every slide eagerly mounts
    // a Mapbox canvas that streams tiles / sprites / style JSON, so on a large
    // deck the window `load` event waits on that flood and can blow past a
    // 60s budget (the same network-event trap the readiness coordinator was
    // built to avoid). We don't need `load` — capture is gated on the explicit
    // window.__pdfReady__ signal below, which is far more precise.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 })

    // The shells set window.__pdfReady__ once maps have all fired their
    // onReady callbacks AND a post-map settle window has elapsed (so ECharts
    // entrance animations finish). See lib/pdfReadiness.ts for the contract.
    args.log('waiting for window.__pdfReady__')
    // Playwright's signature is (pageFunction, arg, options) — passing options
    // as the 2nd arg silently turns into `arg` and the default 30s timeout
    // applies. Use `undefined` for arg so the 3rd-position options stick.
    await page.waitForFunction(
      () => (window as unknown as { __pdfReady__?: boolean }).__pdfReady__ === true,
      undefined,
      { timeout: READY_TIMEOUT_MS }
    )

    args.log('capturing pdf')
    const pdfBytes = await page.pdf({
      ...cfg.pdfArgs,
      printBackground: true,
      preferCSSPageSize: true,
      // Margins are zero by default; the shells own all padding inside
      // their .pdf-page sections.
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    })

    // First-page screenshot for the demo gallery thumbnail. The page is
    // already rendered at print viewport; capturing the visible viewport
    // (no scroll) gives us page 1 — both report and slides routes start
    // page 1 at the top of the document, so this is page-accurate.
    let thumbnailBytes: Buffer | null = null
    try {
      args.log('capturing first-page thumbnail')
      const screenshot = await page.screenshot({
        type: 'png',
        clip: {
          x: 0,
          y: 0,
          width: cfg.viewport.width,
          height: cfg.viewport.height,
        },
      })
      thumbnailBytes = Buffer.from(screenshot)
    } catch (err) {
      args.log(
        `thumbnail capture failed (non-fatal): ${err instanceof Error ? err.message : err}`
      )
    }

    await context.close()
    return { pdfBuffer: Buffer.from(pdfBytes), thumbnailBuffer: thumbnailBytes }
  } finally {
    await browser.close()
  }
}

async function uploadAndRecord(args: {
  supabase: SupabaseClient
  slug: string
  format: PdfFormat
  contentRevisionHash: string
  pdfBuffer: Buffer
  thumbnailBuffer: Buffer | null
}): Promise<{ publicUrl: string; thumbnailUrl: string | null }> {
  const storagePath = `${args.slug}/${args.format}.pdf`

  const { error: uploadErr } = await args.supabase.storage
    .from(PDF_BUCKET)
    .upload(storagePath, args.pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })
  if (uploadErr) throw new Error(`upload: ${uploadErr.message}`)

  const { data } = args.supabase.storage.from(PDF_BUCKET).getPublicUrl(storagePath)
  const publicUrl = data.publicUrl

  let thumbnailUrl: string | null = null
  if (args.thumbnailBuffer) {
    const thumbPath = `${args.slug}/${args.format}__thumb.png`
    const { error: thumbErr } = await args.supabase.storage
      .from(PDF_BUCKET)
      .upload(thumbPath, args.thumbnailBuffer, {
        contentType: 'image/png',
        upsert: true,
      })
    if (!thumbErr) {
      thumbnailUrl = args.supabase.storage.from(PDF_BUCKET).getPublicUrl(thumbPath).data.publicUrl
    }
  }

  const { error: dbErr } = await args.supabase.from('story_pdfs').upsert(
    {
      slug: args.slug,
      format: args.format,
      storage_path: storagePath,
      public_url: publicUrl,
      thumbnail_url: thumbnailUrl,
      content_revision_hash: args.contentRevisionHash,
      // Clear the in-flight stub timestamp set by markPdfDispatched().
      // classifyPdfState() prefers `public_url` regardless, but nulling
      // this keeps the row's state unambiguous in DB readers.
      dispatched_at: null,
    },
    { onConflict: 'slug,format' }
  )
  if (dbErr) throw new Error(`db upsert: ${dbErr.message}`)

  return { publicUrl, thumbnailUrl }
}

export async function renderStoryPdf(args: {
  supabase: SupabaseClient
  slug: string
  format: PdfFormat
  baseUrl: string
  force?: boolean
  log?: (msg: string) => void
}): Promise<RenderResult> {
  const log = args.log ?? (() => {})

  const source = getContentSource()
  const contentRevisionHash = await computeContentRevisionHash(source, args.slug)

  if (!args.force) {
    const existing = await getCachedPdf(args.supabase, args.slug, args.format)
    if (existing && existing.content_revision_hash === contentRevisionHash) {
      log(`cached (hash match) → ${existing.public_url}`)
      return {
        public_url: existing.public_url,
        cached: true,
        content_revision_hash: contentRevisionHash,
      }
    }
  }

  log(`rendering ${args.format} via ${args.baseUrl}`)
  const { pdfBuffer, thumbnailBuffer } = await renderPdfBuffer({
    slug: args.slug,
    format: args.format,
    baseUrl: args.baseUrl,
    log,
  })

  log(`uploading ${(pdfBuffer.length / 1024).toFixed(1)}KB to ${PDF_BUCKET}`)
  const { publicUrl } = await uploadAndRecord({
    supabase: args.supabase,
    slug: args.slug,
    format: args.format,
    contentRevisionHash,
    pdfBuffer,
    thumbnailBuffer,
  })

  log(`✓ ${publicUrl}`)
  return {
    public_url: publicUrl,
    cached: false,
    content_revision_hash: contentRevisionHash,
  }
}
