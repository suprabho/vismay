/**
 * Aura poster service — a deliberately tiny HTTP server that screenshots
 * `aura.promad.design` embeds and returns the frame as a JPEG.
 *
 * Exists because the share-card composer needs a still poster of the animated
 * aura (a cross-origin iframe html-to-image can't rasterize), and running
 * headless Chromium inside a Vercel serverless function is fragile. This runs
 * anywhere a container runs (Fly.io / Railway / Render / a VPS) on the
 * official Playwright image, with a real browser. See README.md for deploy
 * notes; the admin app proxies to it from
 * `/api/footshorts/share/aura-poster` via AURA_POSTER_SERVICE_URL.
 *
 * Routes:
 *   GET /healthz                          → 200 "ok" (no auth)
 *   GET /poster/<slug>?width=&height=     → image/jpeg (Bearer AURA_POSTER_TOKEN)
 *
 * Env:
 *   PORT                (default 8080)
 *   AURA_POSTER_TOKEN   shared secret; when set, /poster requires
 *                       `Authorization: Bearer <token>`. Unset = open (dev only).
 *   AURA_EMBED_ORIGIN   default https://aura.promad.design
 */

import { createServer } from 'node:http'
import { chromium } from 'playwright'

const PORT = Number(process.env.PORT) || 8080
const TOKEN = process.env.AURA_POSTER_TOKEN ?? ''
const EMBED_ORIGIN = process.env.AURA_EMBED_ORIGIN ?? 'https://aura.promad.design'

/** Embed slugs are kebab-case scene ids. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,199}$/i

/** How long the scene gets to boot + animate past its fade-in before the shot. */
const SETTLE_MS = 2_500
const GOTO_TIMEOUT_MS = 30_000

function clampDim(raw, fallback) {
  const n = Math.round(Number(raw))
  return Number.isFinite(n) ? Math.min(Math.max(n, 320), 2160) : fallback
}

// One long-lived browser shared across requests (a context per request keeps
// them isolated); relaunched if it dies. Serialized launch so concurrent cold
// requests don't race two browsers into existence.
let browserPromise = null
async function getBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null)
    if (b?.isConnected()) return b
  }
  browserPromise = chromium.launch({
    args: ['--disable-blink-features=AutomationControlled'],
  })
  return browserPromise
}

async function capturePoster(slug, width, height) {
  const browser = await getBrowser()
  const context = await browser.newContext({ viewport: { width, height } })
  try {
    const page = await context.newPage()
    const url = `${EMBED_ORIGIN}/embed/${slug}?hideText=true&hideIcons=true&input=off&theme=light`
    await page.goto(url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS })
    await page.waitForTimeout(SETTLE_MS)
    return await page.screenshot({ type: 'jpeg', quality: 88 })
  } finally {
    await context.close().catch(() => {})
  }
}

function sendJson(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body))
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': buf.length })
  res.end(buf)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')

  if (req.method === 'GET' && url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
    return
  }

  const match = req.method === 'GET' && /^\/poster\/([^/]+)$/.exec(url.pathname)
  if (!match) {
    sendJson(res, 404, { error: 'not found' })
    return
  }

  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) {
    sendJson(res, 401, { error: 'unauthorized' })
    return
  }

  const slug = decodeURIComponent(match[1])
  if (!SLUG_RE.test(slug)) {
    sendJson(res, 400, { error: 'invalid slug' })
    return
  }
  const width = clampDim(url.searchParams.get('width'), 1080)
  const height = clampDim(url.searchParams.get('height'), 1350)

  try {
    const jpeg = await capturePoster(slug, width, height)
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': jpeg.length,
      // Same slug+size re-captures are cheap and scenes are animated anyway —
      // don't let an intermediary pin one frame for long.
      'Cache-Control': 'no-store',
    })
    res.end(jpeg)
  } catch (e) {
    console.error(`poster capture failed for ${slug}:`, e)
    sendJson(res, 502, { error: e instanceof Error ? e.message : 'capture failed' })
  }
})

server.listen(PORT, () => {
  console.log(`aura-poster listening on :${PORT} (origin ${EMBED_ORIGIN}, auth ${TOKEN ? 'on' : 'OFF'})`)
})

// Let the platform restart us cleanly on deploys.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => process.exit(0))
  })
}
