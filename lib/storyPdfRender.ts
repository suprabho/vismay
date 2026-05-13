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
import { ADMIN_COOKIE_NAME, expectedToken } from './adminAuth'
import { getContentSource } from './contentSource'
import {
  computeContentRevisionHash,
  getCachedPdf,
  PDF_BUCKET,
  type PdfFormat,
} from './storyPdf'

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

// Must exceed the in-page fallback timer in lib/pdfReadiness.ts
// (FALLBACK_TIMEOUT_MS = 60_000) so we can ride the fallback when a map
// fails to fire onReady — pages with many maps can hit Chrome's WebGL
// context limit and silently drop the oldest contexts.
const READY_TIMEOUT_MS = 90_000

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
    args: ['--disable-blink-features=AutomationControlled'],
  })
  try {
    const context = await browser.newContext({
      viewport: cfg.viewport,
      deviceScaleFactor: 1,
      // Force animations to actually run — share-card capture / chart
      // entrances rely on this in some setups.
      reducedMotion: 'no-preference',
    })

    // Pre-authenticate as admin so the gated /story/<slug>/<format> route
    // accepts the request. Computes the same hmac the auth lib expects from
    // an /api/admin/login round-trip — skipping that round-trip avoids a
    // dependency on the Next dev server being able to set cookies on us.
    // Throws if ADMIN_PASSWORD isn't configured: in that case the route
    // would redirect us to /admin/login and the render would fail anyway.
    const adminToken = expectedToken()
    if (!adminToken) {
      throw new Error(
        'ADMIN_PASSWORD not set — cannot authenticate Playwright against gated /story/<slug>/<format> route'
      )
    }
    const cookieUrl = new URL(args.baseUrl)
    await context.addCookies([
      {
        name: ADMIN_COOKIE_NAME,
        value: adminToken,
        domain: cookieUrl.hostname,
        path: '/',
        httpOnly: true,
        secure: cookieUrl.protocol === 'https:',
        sameSite: 'Lax',
      },
    ])

    const page = await context.newPage()

    const url = `${args.baseUrl}/story/${args.slug}/${args.format}?print=1`
    args.log(`navigating: ${url}`)
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 })

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
