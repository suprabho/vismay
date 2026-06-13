/**
 * Headless screenshot of a catalog embed URL.
 *
 * Mirrors the launch flags and readiness contract the story video/PDF pipelines
 * already rely on: the embed page wires `useStoryReadiness`, which flips
 * `window.__pdfReady__ = true` once the module has signalled `noteReady()` (plus
 * a short settle), or after a fallback timeout if a module never signals. We
 * wait on that flag rather than `networkidle`, which never resolves for pages
 * with Mapbox tile streaming / websockets.
 */

import { chromium } from 'playwright'

export interface ScreenshotOptions {
  url: string
  width: number
  height: number
  deviceScaleFactor: number
  /** Transparent PNG (omit page background) — useful for foreground overlays. */
  transparent: boolean
  /** How long to wait for window.__pdfReady__ before giving up. */
  readyTimeoutMs: number
}

export async function screenshotModule(opts: ScreenshotOptions): Promise<Buffer> {
  const browser = await chromium.launch({
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--disable-blink-features=AutomationControlled',
    ],
  })
  try {
    const context = await browser.newContext({
      viewport: { width: opts.width, height: opts.height },
      deviceScaleFactor: opts.deviceScaleFactor,
    })
    const page = await context.newPage()
    await page.goto(opts.url, { waitUntil: 'load', timeout: 60_000 })
    // The readiness coordinator sets this once the module is painted + settled.
    await page.waitForFunction(
      () => (window as unknown as { __pdfReady__?: boolean }).__pdfReady__ === true,
      undefined,
      { timeout: opts.readyTimeoutMs },
    )
    // Prefer the stable wrapper the embed page renders; fall back to viewport.
    const root = await page.$('[data-embed-root]')
    const buf = root
      ? await root.screenshot({ type: 'png', omitBackground: opts.transparent })
      : await page.screenshot({
          type: 'png',
          omitBackground: opts.transparent,
          fullPage: false,
        })
    await context.close()
    return buf
  } finally {
    await browser.close()
  }
}
