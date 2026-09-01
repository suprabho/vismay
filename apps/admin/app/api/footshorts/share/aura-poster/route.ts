import { NextResponse, type NextRequest } from 'next/server'
import type { Browser } from 'playwright-core'
import { isAuthed } from '@/lib/adminAuth'

export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'

/** Embed slugs are kebab-case scene ids on aura.promad.design. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,199}$/i

function clampDim(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? Math.round(v) : NaN
  return Number.isFinite(n) ? Math.min(Math.max(n, 320), 2160) : fallback
}

/** Local dev launches the Playwright-managed Chromium install. On Vercel that
 *  download doesn't exist inside the function bundle (`playwright` resolves a
 *  browsers cache that was never populated), so launch the @sparticuz/chromium
 *  build shipped in node_modules through playwright-core instead — the same
 *  pattern as any serverless headless-Chromium function. */
async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    const { default: sparticuz } = await import('@sparticuz/chromium')
    const { chromium } = await import('playwright-core')
    return chromium.launch({
      args: sparticuz.args,
      executablePath: await sparticuz.executablePath(),
      headless: true,
    })
  }
  const { chromium } = await import('playwright')
  return chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] })
}

/**
 * Capture a still poster frame of an `aura.promad.design` embed.
 *
 * The share-card composer shows the aura as a live cross-origin iframe, which
 * html-to-image can never rasterize — so without a poster image the aura is
 * silently absent from the published PNG. This route screenshots the embed in
 * headless Chromium at the card's output size and returns it as a JPEG data
 * URL the composer attaches as the aura background's `posterSrc` (JPEG keeps
 * the multi-hundred-KB frame from ballooning the config snapshot, which
 * travels as JSON through the publish route's ~4.5 MB body cap).
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as {
    slug?: string
    width?: number
    height?: number
  }
  const slug = body.slug?.trim() ?? ''
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 })
  }
  const width = clampDim(body.width, 1080)
  const height = clampDim(body.height, 1350)

  // Launch inside the try: a failed launch (e.g. a missing browser binary)
  // must surface as our JSON error, not an unhandled 500 the client can't read.
  let browser: Browser | null = null
  try {
    browser = await launchBrowser()
    const page = await browser.newPage({ viewport: { width, height } })
    const url = `https://aura.promad.design/embed/${slug}?hideText=true&hideIcons=true&input=off&theme=light`
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 })
    // The scene boots and animates after load; give it a moment so the shot
    // lands mid-animation instead of on a blank or fading-in first frame.
    await page.waitForTimeout(2_500)
    const jpeg = await page.screenshot({ type: 'jpeg', quality: 88 })
    const dataUrl = `data:image/jpeg;base64,${jpeg.toString('base64')}`
    return NextResponse.json({ ok: true, dataUrl })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'aura poster capture failed' },
      { status: 502 },
    )
  } finally {
    await browser?.close().catch(() => {})
  }
}
