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

const READY_TIMEOUT_MS = 60_000

export interface RenderResult {
  public_url: string
  cached: boolean
  content_revision_hash: string
}

async function renderPdfBuffer(args: {
  slug: string
  format: PdfFormat
  baseUrl: string
  log: (msg: string) => void
}): Promise<Buffer> {
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
    await page.waitForFunction(
      () => (window as unknown as { __pdfReady__?: boolean }).__pdfReady__ === true,
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

    await context.close()
    return Buffer.from(pdfBytes)
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
}): Promise<string> {
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

  const { error: dbErr } = await args.supabase.from('story_pdfs').upsert(
    {
      slug: args.slug,
      format: args.format,
      storage_path: storagePath,
      public_url: publicUrl,
      content_revision_hash: args.contentRevisionHash,
      // Clear the in-flight stub timestamp set by markPdfDispatched().
      // classifyPdfState() prefers `public_url` regardless, but nulling
      // this keeps the row's state unambiguous in DB readers.
      dispatched_at: null,
    },
    { onConflict: 'slug,format' }
  )
  if (dbErr) throw new Error(`db upsert: ${dbErr.message}`)

  return publicUrl
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
  const pdfBuffer = await renderPdfBuffer({
    slug: args.slug,
    format: args.format,
    baseUrl: args.baseUrl,
    log,
  })

  log(`uploading ${(pdfBuffer.length / 1024).toFixed(1)}KB to ${PDF_BUCKET}`)
  const publicUrl = await uploadAndRecord({
    supabase: args.supabase,
    slug: args.slug,
    format: args.format,
    contentRevisionHash,
    pdfBuffer,
  })

  log(`✓ ${publicUrl}`)
  return {
    public_url: publicUrl,
    cached: false,
    content_revision_hash: contentRevisionHash,
  }
}
