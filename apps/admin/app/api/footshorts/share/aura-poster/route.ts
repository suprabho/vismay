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

/** Fetch the poster frame from the standalone aura-poster service (see
 *  apps/aura-poster) — a plain container with a real Chromium, which is far
 *  more reliable than launching a browser inside a serverless function. */
async function posterFromService(slug: string, width: number, height: number): Promise<Buffer> {
  const base = process.env.AURA_POSTER_SERVICE_URL!.replace(/\/+$/, '')
  const token = process.env.AURA_POSTER_SERVICE_TOKEN
  const res = await fetch(
    `${base}/poster/${encodeURIComponent(slug)}?width=${width}&height=${height}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    },
  )
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `poster service HTTP ${res.status}`)
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
 * html-to-image can never rasterize — so without a poster image the aura is
 * silently absent from the published PNG. This route returns the frame as a
 * JPEG data URL the composer attaches as the aura background's `posterSrc`
 * (JPEG keeps the multi-hundred-KB frame from ballooning the config snapshot,
 * which travels as JSON through the publish route's ~4.5 MB body cap).
 *
 * The frame comes from the aura-poster service (`AURA_POSTER_SERVICE_URL` +
 * `AURA_POSTER_SERVICE_TOKEN`, see apps/aura-poster/README.md); the route
 * itself never launches a browser in a deployed environment. Local dev without
 * the service configured falls back to the machine's own Playwright Chromium.
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
    let jpeg: Buffer
    if (process.env.AURA_POSTER_SERVICE_URL) {
      jpeg = await posterFromService(slug, width, height)
    } else if (!process.env.VERCEL) {
      jpeg = await posterFromLocalBrowser(slug, width, height)
    } else {
      return NextResponse.json(
        {
          error:
            'AURA_POSTER_SERVICE_URL is not configured — deploy apps/aura-poster and set it (plus AURA_POSTER_SERVICE_TOKEN) on this project.',
        },
        { status: 503 },
      )
    }
    const dataUrl = `data:image/jpeg;base64,${jpeg.toString('base64')}`
    return NextResponse.json({ ok: true, dataUrl })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'aura poster capture failed' },
      { status: 502 },
    )
  }
}
