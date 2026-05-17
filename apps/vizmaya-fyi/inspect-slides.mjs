import { chromium } from 'playwright'

const slug = process.argv[2] || 'southern-russia-airports-2025'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

// Login
await page.goto('http://localhost:3000/admin/login')
await page.fill('input[type="password"]', 'V1zm@ya@2026')
await page.click('button[type="submit"]')
await page.waitForURL(/\/admin/, { timeout: 10000 }).catch(() => {})

// Visit /reports/<slug> to mimic user's surface (iframe preview)
const reportsUrl = `http://localhost:3000/reports/${slug}`
console.log('navigating to', reportsUrl)
await page.goto(reportsUrl, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)

// Switch to slides format
const slidesBtn = page.locator('button', { hasText: /^slides$/i }).first()
await slidesBtn.click().catch(e => console.log('no slides button:', e.message))
await page.waitForTimeout(500)

// Wait for iframe + maps
const iframeEl = await page.waitForSelector('iframe', { timeout: 10000 })
const frame = await iframeEl.contentFrame()
if (!frame) { console.log('no frame'); await browser.close(); process.exit(1) }

// Force-scroll through all PreviewFrames so lazy maps mount
const previewCount = await frame.locator('section').count()
console.log('preview sections in iframe:', previewCount)

// Scroll inside the iframe through each section
const sections = await frame.locator('section').elementHandles()
for (let i = 0; i < sections.length; i++) {
  await sections[i].scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
}
await page.waitForTimeout(2000)

const data = await frame.evaluate(() => {
  const sections = Array.from(document.querySelectorAll('[data-pdf-shell="slides"] section'))
  return sections.map((sec, i) => {
    const rect = sec.getBoundingClientRect()
    const mapHost = sec.querySelector('.mapboxgl-map')
    const mapRect = mapHost?.getBoundingClientRect()
    const canvas = sec.querySelector('.mapboxgl-canvas')
    const canvasRect = canvas?.getBoundingClientRect()
    return {
      i,
      sec: rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : null,
      mapHost: mapRect ? `${Math.round(mapRect.width)}x${Math.round(mapRect.height)}` : null,
      canvasRect: canvasRect ? `${Math.round(canvasRect.width)}x${Math.round(canvasRect.height)}` : null,
      canvasInternal: canvas ? `${canvas.width}x${canvas.height}` : null,
    }
  })
})

console.log('canvas dims:', JSON.stringify(data, null, 2))

// Screenshot the iframe content (slide 2 in particular)
if (sections.length > 1) {
  await sections[1].scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await sections[1].screenshot({ path: '/tmp/slide2.png' })
  console.log('slide 2 screenshot: /tmp/slide2.png')
}
await page.screenshot({ path: '/tmp/full.png', fullPage: false })

await browser.close()
