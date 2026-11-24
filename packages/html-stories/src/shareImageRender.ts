/**
 * Renders a story's link-preview card (./shareImage) in headless Chromium:
 *
 *   1. Open /s/<slug> at a desktop viewport, served from the stored row
 *      exactly as ./serve would serve it (the request is answered locally, so
 *      a draft renders too and a CDN copy a minute old never does; the page's
 *      own scripts, fonts and images still load from the site and the web).
 *      Reduced motion, so stories settle on their final frame.
 *   2. Screenshot the first screen, and note the page's heading font.
 *   3. Lay that screenshot beside the title and description, in the page's
 *      palette (<meta name="vizmaya:theme">) and heading font, at 1200×630.
 *   4. Upload it to story-assets/html-story-og/<slug>/<hash>.jpg, record it on
 *      the row, and remove the story's older cards.
 *
 * Run by scripts/generate-share-image.ts (render-html-story-og.yml). Imports
 * Playwright, so no app route may import this file.
 */

import { chromium, type Browser } from 'playwright'
import { createServiceClient } from '@vismay/content-source/supabase'
import { HTML_STORY_APP_META, type HtmlStoryApp } from './apps'
import { getHtmlStoryForAdmin, getHtmlStoryApp, type HtmlStory } from './htmlStories'
import { extractThemeMeta, type ThemeColors } from './meta'
import { siteOrigin } from './seo'
import { htmlStoryResponse } from './serve'
import {
  HTML_STORY_SHARE_IMAGE_BUCKET,
  HTML_STORY_SHARE_IMAGE_PREFIX,
  HTML_STORY_SHARE_IMAGE_SIZE,
  setHtmlStoryShareImage,
  shareImageHash,
} from './shareImage'

/** The browser window the story is captured in (16:10). */
const PAGE_VIEWPORT = { width: 1280, height: 800 }
const LOAD_TIMEOUT_MS = 45_000
const IDLE_TIMEOUT_MS = 15_000
/** After load: intro transitions, lazy charts, map tiles. */
const SETTLE_MS = 2_500

interface CardLook {
  background: string
  surface: string
  text: string
  muted: string
  line: string
  accent: string
  /** Font stacks; the page's own heading font goes first when it has one. */
  heading: string
  body: string
  /** Google Fonts stylesheet for the fallback faces. */
  fontsHref: string
}

const APP_LOOK: Record<HtmlStoryApp, CardLook> = {
  'vizmaya-fyi': {
    background: '#0a0e14',
    surface: '#111820',
    text: '#e0ddd5',
    muted: '#8a969c',
    line: '#24303a',
    accent: '#D85A30',
    heading: "'Source Serif 4', Georgia, serif",
    body: "Inter, -apple-system, 'Segoe UI', sans-serif",
    fontsHref: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Source+Serif+4:opsz,wght@8..60,600&display=block',
  },
  footshorts: {
    background: '#0B0B0F',
    surface: '#15151b',
    text: '#F4F4F5',
    muted: '#a1a1aa',
    line: '#27272f',
    accent: '#F26A3C',
    heading: "'Space Grotesk', -apple-system, 'Segoe UI', sans-serif",
    body: "'Space Grotesk', -apple-system, 'Segoe UI', sans-serif",
    fontsHref: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=block',
  },
  vizf1: {
    background: '#0b0d12',
    surface: '#141821',
    text: '#f5f5f5',
    muted: '#9aa0ab',
    line: '#232836',
    accent: '#ff4346',
    heading: "Saira, -apple-system, 'Segoe UI', sans-serif",
    body: "Saira, -apple-system, 'Segoe UI', sans-serif",
    fontsHref: 'https://fonts.googleapis.com/css2?family=Saira:wght@400;600;700&display=block',
  },
  viznba: {
    background: '#0b0d12',
    surface: '#141821',
    text: '#f5f5f5',
    muted: '#9aa0ab',
    line: '#232836',
    accent: '#ff8a3d',
    heading: "Saira, -apple-system, 'Segoe UI', sans-serif",
    body: "Saira, -apple-system, 'Segoe UI', sans-serif",
    fontsHref: 'https://fonts.googleapis.com/css2?family=Saira:wght@400;600;700&display=block',
  },
  travel: {
    background: '#f6f1e7',
    surface: '#ffffff',
    text: '#2b2419',
    muted: '#6f6453',
    line: '#e3d9c6',
    accent: '#c94f2c',
    heading: "Manrope, -apple-system, 'Segoe UI', sans-serif",
    body: "Manrope, -apple-system, 'Segoe UI', sans-serif",
    fontsHref: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&display=block',
  },
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** A font-family value safe to put in a style attribute. */
function safeFontFamily(s: string | null | undefined): string | null {
  const v = s?.trim()
  return v && /^[\w\s"',.-]+$/.test(v) ? v : null
}

function cardLook(app: HtmlStoryApp, theme: ThemeColors | null, pageHeadingFont: string | null): CardLook {
  const base = APP_LOOK[app]
  const t = theme ?? {}
  return {
    ...base,
    background: t.background ?? base.background,
    surface: t.surface ?? base.surface,
    text: t.text ?? base.text,
    muted: t.muted ?? base.muted,
    line: t.line ?? base.line,
    accent: t.accent ?? base.accent,
    heading: pageHeadingFont ? `${pageHeadingFont}, ${base.heading}` : base.heading,
  }
}

/** Long headlines step down so they fit in five lines of the text column. */
function titleSize(title: string): number {
  const n = title.length
  if (n <= 36) return 58
  if (n <= 60) return 50
  if (n <= 90) return 42
  return 36
}

export interface ShareCardInput {
  app: HtmlStoryApp
  slug: string
  title: string
  description: string | null
  /** The page's first screen (PNG/JPEG data URL). */
  screenshot: string
  look: CardLook
  /** Stylesheets the page loaded its fonts from, so the heading face is available here too. */
  fontStylesheets: string[]
}

/** The card's HTML, 1200×630: site, title, description and URL on the left; the page on the right. */
export function shareCardHtml({ app, slug, title, description, screenshot, look, fontStylesheets }: ShareCardInput): string {
  const { width, height } = HTML_STORY_SHARE_IMAGE_SIZE
  const meta = HTML_STORY_APP_META[app]
  const host = siteOrigin(app).replace(/^https?:\/\//, '').replace(/^www\./, '')
  const shotW = 720
  const shotH = Math.round((shotW * PAGE_VIEWPORT.height) / PAGE_VIEWPORT.width)
  const barH = 30
  const shotTop = Math.round((height - shotH - barH) / 2)
  const links = [look.fontsHref, ...fontStylesheets]
    .filter((href, i, all) => /^https:\/\//.test(href) && all.indexOf(href) === i)
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8">${links}<style>
*{box-sizing:border-box}
html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}
body{position:relative;background:${look.background};color:${look.text};font-family:${look.body};-webkit-font-smoothing:antialiased}
.glow{position:absolute;inset:0;background:radial-gradient(900px 520px at 88% 30%, color-mix(in srgb, ${look.accent} 22%, transparent), transparent 70%)}
.text{position:absolute;left:64px;top:56px;bottom:52px;width:430px;display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:${look.accent}}
.brand i{width:11px;height:11px;border-radius:50%;background:${look.accent}}
.main{margin:auto 0}
h1{margin:0;font-family:${look.heading};font-weight:600;font-size:${titleSize(title)}px;line-height:1.08;letter-spacing:-.01em;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:5;overflow:hidden;text-wrap:balance}
p{margin:20px 0 0;font-size:21px;line-height:1.42;color:${look.muted};display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.url{font-size:17px;color:${look.muted};padding-top:18px;border-top:1px solid ${look.line}}
.shot{position:absolute;left:548px;top:${shotTop}px;width:${shotW}px;border-radius:14px;overflow:hidden;background:${look.surface};border:1px solid ${look.line};box-shadow:0 28px 70px rgba(0,0,0,.42),0 2px 8px rgba(0,0,0,.2)}
.bar{height:${barH}px;display:flex;align-items:center;gap:7px;padding:0 14px;border-bottom:1px solid ${look.line}}
.bar i{width:10px;height:10px;border-radius:50%;background:${look.muted};opacity:.45}
.bar span{margin-left:12px;font-size:13px;color:${look.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:560px}
.shot img{display:block;width:${shotW}px;height:${shotH}px;object-fit:cover;object-position:top}
</style></head><body>
<div class="glow"></div>
<div class="text">
  <div class="brand"><i></i>${escapeHtml(meta.name)}</div>
  <div class="main">
    <h1>${escapeHtml(title)}</h1>
    ${description ? `<p>${escapeHtml(description)}</p>` : ''}
  </div>
  <div class="url">${escapeHtml(host)}</div>
</div>
<div class="shot"><div class="bar"><i></i><i></i><i></i><span>${escapeHtml(`${host}/s/${slug}`)}</span></div><img src="${screenshot}" alt=""></div>
</body></html>`
}

interface PageCapture {
  screenshot: string
  headingFont: string | null
  fontStylesheets: string[]
}

/** Open the story as served and capture its first screen. */
async function capturePage(browser: Browser, story: HtmlStory, app: HtmlStoryApp, log: (m: string) => void): Promise<PageCapture> {
  const url = `${siteOrigin(app)}/s/${story.slug}`
  // The page exactly as /s/<slug> serves it, chrome and all (no Listen player).
  const served = htmlStoryResponse(new Request(url), story, app)
  const body = await served.text()
  const headers: Record<string, string> = {}
  served.headers.forEach((v, k) => (headers[k] = v))

  const context = await browser.newContext({
    viewport: PAGE_VIEWPORT,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  })
  try {
    const page = await context.newPage()
    const target = new URL(url)
    await page.route(
      (u) => u.origin === target.origin && u.pathname === target.pathname,
      (route) =>
        route.request().isNavigationRequest()
          ? route.fulfill({ status: 200, headers, body })
          : route.continue(),
    )
    log(`  opening ${url}`)
    await page.goto(url, { waitUntil: 'load', timeout: LOAD_TIMEOUT_MS })
    await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT_MS }).catch(() => log('  (network still busy; capturing anyway)'))
    await page.evaluate(() => document.fonts?.ready).catch(() => {})
    await page.waitForTimeout(SETTLE_MS)

    const info = await page.evaluate(() => {
      const h = document.querySelector('h1, h2, [class*="title" i]') as HTMLElement | null
      const fonts = Array.from(document.querySelectorAll('link[rel~="stylesheet"]'))
        .map((l) => (l as HTMLLinkElement).href)
        .filter((href) => /fonts\.(googleapis|bunny)\.net|use\.typekit\.net|fonts\.cdnfonts\.com/.test(href))
      return { headingFont: h ? getComputedStyle(h).fontFamily : null, fontStylesheets: fonts }
    })
    const shot = await page.screenshot({ type: 'jpeg', quality: 88 })
    return {
      screenshot: `data:image/jpeg;base64,${shot.toString('base64')}`,
      headingFont: safeFontFamily(info.headingFont),
      fontStylesheets: info.fontStylesheets.slice(0, 4),
    }
  } finally {
    await context.close()
  }
}

/** The card for a story, as JPEG bytes. */
export async function renderShareCard(
  browser: Browser,
  story: HtmlStory,
  app: HtmlStoryApp,
  log: (m: string) => void = () => {},
): Promise<Buffer> {
  const capture = await capturePage(browser, story, app, log)
  const look = cardLook(app, extractThemeMeta(story.html), capture.headingFont)
  const context = await browser.newContext({ viewport: HTML_STORY_SHARE_IMAGE_SIZE, deviceScaleFactor: 1 })
  try {
    const page = await context.newPage()
    await page.setContent(
      shareCardHtml({
        app,
        slug: story.slug,
        title: story.title,
        description: story.description,
        screenshot: capture.screenshot,
        look,
        fontStylesheets: capture.fontStylesheets,
      }),
      { waitUntil: 'load', timeout: LOAD_TIMEOUT_MS },
    )
    await page.evaluate(() => document.fonts?.ready).catch(() => {})
    return await page.screenshot({ type: 'jpeg', quality: 90 })
  } finally {
    await context.close()
  }
}

export interface GenerateShareImageResult {
  slug: string
  mode: 'rendered' | 'unchanged'
  url: string | null
}

/**
 * Render, upload and record a story's card. Unchanged since the last card:
 * nothing happens, unless `force`.
 */
export async function generateHtmlStoryShareImage({
  slug,
  force = false,
  log = console.log,
}: {
  slug: string
  force?: boolean
  log?: (m: string) => void
}): Promise<GenerateShareImageResult> {
  const app = await getHtmlStoryApp(slug)
  if (!app) throw new Error(`no story ${slug}`)
  if (app === 'travel') throw new Error('travel stories are private to a trip, so they get no share image')
  const story = await getHtmlStoryForAdmin(slug, app)
  if (!story) throw new Error(`no story ${slug}`)

  const hash = shareImageHash({ app, html: story.html, title: story.title, description: story.description, aura: story.aura })
  const sb = createServiceClient()
  const { data: row } = await sb.from('html_stories').select('share_image_hash').eq('slug', slug).maybeSingle()
  if (!force && story.shareImageUrl && row?.share_image_hash === hash) {
    log(`= ${slug}: share image is up to date`)
    return { slug, mode: 'unchanged', url: story.shareImageUrl }
  }

  log(`→ ${slug} (${app})`)
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  let jpeg: Buffer
  try {
    jpeg = await renderShareCard(browser, story, app, log)
  } finally {
    await browser.close()
  }

  const bucket = sb.storage.from(HTML_STORY_SHARE_IMAGE_BUCKET)
  const folder = `${HTML_STORY_SHARE_IMAGE_PREFIX}/${slug}`
  const path = `${folder}/${hash}.jpg`
  const { error: upErr } = await bucket.upload(path, jpeg, {
    contentType: 'image/jpeg',
    // The name changes with the content, so a copy never goes stale.
    cacheControl: '31536000',
    upsert: true,
  })
  if (upErr) throw new Error(`upload ${path}: ${upErr.message}`)
  const url = bucket.getPublicUrl(path).data.publicUrl
  await setHtmlStoryShareImage(slug, url, hash)
  log(`✓ ${slug}: ${url} (${Math.round(jpeg.byteLength / 1024)} KB)`)

  // Older cards are no longer linked from anywhere.
  const { data: old } = await bucket.list(folder, { limit: 100 })
  const stale = (old ?? []).map((f) => `${folder}/${f.name}`).filter((p) => p !== path)
  if (stale.length) await bucket.remove(stale).catch(() => {})

  return { slug, mode: 'rendered', url }
}
