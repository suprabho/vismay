import { NextResponse, type NextRequest } from 'next/server'
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

const FETCH_TIMEOUT_MS = 60_000

/**
 * Fetch the poster frame from the aura render service (`aura-render` on Fly,
 * source: beautiful-headers/render-service) — the same warm-browser service
 * that backs `aura.promad.design/scenes/<slug>/capture.png`. Contract:
 * `GET /scene/<slug>/capture.(png|webp)?w=&h=&dpr=` authenticated with the
 * `x-render-secret` header. We ask for webp: the frame travels as a data URL
 * inside the card's config snapshot (publish route ≈ 4.5 MB body cap), and a
 * 1080×1350 png is ~2.6 MB where the webp is ~300 KB.
 */
async function posterFromService(slug: string, width: number, height: number): Promise<Buffer> {
  const base = process.env.AURA_POSTER_SERVICE_URL!.replace(/\/+$/, '')
  const secret = process.env.AURA_POSTER_SERVICE_TOKEN
  const q = new URLSearchParams({
    w: String(width),
    h: String(height),
    dpr: '1',
    hideText: 'true',
    hideIcons: 'true',
    theme: 'light',
    quality: '85',
  })
  const res = await fetch(`${base}/scene/${encodeURIComponent(slug)}/capture.webp?${q}`, {
    headers: secret ? { 'x-render-secret': secret } : undefined,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).trim().slice(0, 200)
    throw new Error(
      res.status === 401
        ? 'aura render service rejected the secret (AURA_POSTER_SERVICE_TOKEN must equal its RENDER_SECRET)'
        : `aura render service HTTP ${res.status}${body ? `: ${body}` : ''}`,
    )
  }
  return Buffer.from(await res.arrayBuffer())
}

/** Local-dev fallback: no poster service needed on a laptop — launch the
 *  Playwright-managed Chromium directly (it exists there, unlike in a deployed
 *  function's bundle). */
async function posterFromLocalBrowser(slug: string, width: number, height: number): Promise<Buffer> {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({
    args: ['--disable-blink-features=AutomationControlled'],
  })
  try {
    const page = await browser.newPage({ viewport: { width, height } })
    const url = `https://aura.promad.design/embed/${slug}?hideText=true&hideIcons=true&input=off&theme=light`
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 })
    // The scene boots and animates after load; give it a moment so the shot
    // lands mid-animation instead of on a blank or fading-in first frame.
    await page.waitForTimeout(2_500)
    return await page.screenshot({ type: 'jpeg', quality: 88 })
  } finally {
    await browser.close().catch(() => {})
  }
}

/**
 * Capture a still poster frame of an `aura.promad.design` embed.
 *
 * The share-card composer shows the aura as a live cross-origin iframe, which
 * html-to-image can never rasterize. CardFrame already paints the scene's
 * public `capture.png` still underneath as the export fallback; this route
 * upgrades that with a frame rendered on demand at the card's exact size and
 * hands it back as a data URL the composer attaches as the aura background's
 * `posterSrc` (webp keeps the frame small enough for the publish route's
 * ~4.5 MB body cap).
 *
 * The frame comes from the aura render service (`AURA_POSTER_SERVICE_URL` =
 * the aura-render host, `AURA_POSTER_SERVICE_TOKEN` = its `RENDER_SECRET`);
 * the route itself never launches a browser in a deployed environment. Local
 * dev without the service configured falls back to the machine's own
 * Playwright Chromium.
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

  try {
    let frame: { bytes: Buffer; mime: 'image/webp' | 'image/jpeg' }
    if (process.env.AURA_POSTER_SERVICE_URL) {
      frame = { bytes: await posterFromService(slug, width, height), mime: 'image/webp' }
    } else if (!process.env.VERCEL) {
      frame = { bytes: await posterFromLocalBrowser(slug, width, height), mime: 'image/jpeg' }
    } else {
      return NextResponse.json(
        {
          error:
            'AURA_POSTER_SERVICE_URL is not configured — set it to the aura-render host (plus AURA_POSTER_SERVICE_TOKEN = its RENDER_SECRET) on this project.',
        },
        { status: 503 },
      )
    }
    const dataUrl = `data:${frame.mime};base64,${frame.bytes.toString('base64')}`
    return NextResponse.json({ ok: true, dataUrl })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'aura poster capture failed' },
      { status: 502 },
    )
  }
}
