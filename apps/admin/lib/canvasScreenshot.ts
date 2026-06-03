import { chromium } from 'playwright'
import { signOutputUrl } from '@vismay/admin-core/signedUrl'
import { vizmayaPublicUrl } from '@/lib/publicSite'

/**
 * Server-side screenshot of one rendered canvas section.
 *
 * Mirrors the PDF render path (storyPdfRender.ts) but captures a PNG instead of
 * a PDF: it mints a signed `/story/<slug>/canvas-frame/<sectionId>` URL — the
 * same headless single-section render the canvas iframe shows — loads it in
 * headless Chromium, lets it settle, and screenshots the viewport.
 *
 * Used by the evaluator to give a vision model the actual rendered frame. The
 * canvas-frame page exposes no explicit readiness flag, so we wait on
 * `networkidle` (tiles/charts fetched) plus a settle delay for WebGL/animation
 * paint. Tightening this to a real readiness signal is a later refinement.
 */

const SIGN_TTL_SECONDS = 10 * 60
const NAV_TIMEOUT_MS = 60_000
const DEFAULT_SETTLE_MS = 1800

export interface CanvasScreenshot {
  bytes: Buffer
  mimeType: 'image/png'
  /** The signed URL that was captured (for audit/debug). */
  url: string
}

export async function screenshotCanvasSection(args: {
  slug: string
  sectionId: string
  /** Capture viewport. Defaults to 16:9 at 1280×720. */
  viewport?: { width: number; height: number }
  settleMs?: number
}): Promise<CanvasScreenshot> {
  const viewport = args.viewport ?? { width: 1280, height: 720 }
  const settleMs = args.settleMs ?? DEFAULT_SETTLE_MS

  const url = signOutputUrl({
    baseUrl: vizmayaPublicUrl,
    path: `/story/${encodeURIComponent(args.slug)}/canvas-frame/${encodeURIComponent(args.sectionId)}`,
    ttlSeconds: SIGN_TTL_SECONDS,
  })

  const browser = await chromium.launch({
    args: [
      '--disable-blink-features=AutomationControlled',
      '--max-active-webgl-contexts=64',
    ],
  })
  try {
    const page = await browser.newPage({ viewport })
    await page.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS })
    await page.waitForTimeout(settleMs)
    const shot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: viewport.width, height: viewport.height },
    })
    return { bytes: Buffer.from(shot), mimeType: 'image/png', url }
  } finally {
    await browser.close()
  }
}
