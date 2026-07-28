/**
 * Searching for Umami scraper — walks TasteAtlas's per-cuisine "best rated
 * dishes" listings for five Asian cuisines (India, China, Thailand, Indonesia,
 * Japan) and writes one JSON row per dish into
 * vizmaya-data/searching-for-umami/dishes.json (the importer's input).
 *
 * LOCAL-RUN ONLY. TasteAtlas sits behind Cloudflare and blocks datacenter IPs
 * — the dev sandbox and GitHub Actions runners both are one — so this script
 * must run on a residential connection. It is deliberately split from the
 * importer (same stance as seriously-curious): the scraper writes only the
 * corpus JSON, never the DB.
 *
 * LISTING-ONLY CAPTURE (learned the hard way, 2026-07-27):
 *  - The site is htmx server-rendered — no listing XHR API to capture, and
 *    card links carry hx- handlers, so scripted clicks go nowhere.
 *  - Individual dish-page DOCUMENT requests (e.g. /butter-garlic-naan) are
 *    hard-403'd by a stricter Cloudflare rule than the listing pages, in
 *    every engine/flow tried (goto, goto+referer, same-tab, new-tab), and one
 *    blocked hit poisons the whole session afterwards. The listing pages
 *    themselves load clean — so everything is extracted from the listing
 *    cards, and dish URLs are never visited. Consequences: `ingredients`
 *    stays [] and `rating_count` stays null (neither is on the cards);
 *    `description` is the card blurb, truncated (rights bound unchanged).
 *  - Each listing serves at most 20 dish cards to anonymous visitors (no
 *    lazy-load/pagination for ranks 21+), so the practical corpus is the
 *    top ~20 best-rated dishes per cuisine.
 *  - Playwright's bundled Chromium build is fingerprint-blocked outright
 *    (403 on every page); the system Chrome channel passes. Keep --headed on:
 *    headless advertises HeadlessChrome and gets blocked.
 *  - Only a brand-new profile's FIRST navigation passes; a profile reused
 *    across browser launches gets challenged on every request. The script
 *    therefore wipes .browser-profile and relaunches per cuisine, so every
 *    listing load is a first navigation from a clean identity.
 *
 * Run locally (from apps/vizmaya-fyi):
 *   pnpm searching-for-umami:scrape --cuisine india --limit 10 --headed  # smoke test
 *   pnpm searching-for-umami:scrape --headed                            # full run (~3–5 min)
 *
 * Flags:
 *   --cuisine <slug>  only this cuisine (india|china|thailand|indonesia|japan)
 *   --limit N         dishes per cuisine (default 100)
 *   --headed          visible browser — effectively required (see above)
 *   --force           re-capture dishes already present in dishes.json
 *   --dry-run         discover + print counts, no writes
 *
 * Resumability: dishes already in dishes.json are skipped (unless --force);
 * dishes.json is rewritten atomically (temp + rename) after every cuisine.
 * Kill and re-run freely.
 *
 * Politeness: one document navigation per cuisine (5 total) plus lazy-load
 * scrolling — far below the old per-dish crawl. Sequential, randomized 2–4 s
 * delay between cuisines. Do not parallelize.
 *
 * Rights: descriptions are cut at a sentence boundary and hard-capped at
 * MAX_DESCRIPTION chars — never the full editorial text. source_url carries
 * attribution. The importer re-enforces this bound.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type BrowserContext, type Page } from 'playwright'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../../../../')
const DATA_DIR = resolve(REPO_ROOT, 'vizmaya-data/searching-for-umami')
const DISHES_JSON = resolve(DATA_DIR, 'dishes.json')
const STATE_JSON = resolve(DATA_DIR, 'scrape-state.json')
const PROFILE_DIR = resolve(DATA_DIR, '.browser-profile')

const EPIC_SLUG = 'searching-for-umami'
const ORIGIN = 'https://www.tasteatlas.com'
const MAX_DESCRIPTION = 400

/* ── Cuisine config — editable data, no logic below depends on its shape ──
 * listUrls are ALL scraped and unioned (first list is the canonical ranking);
 * if TasteAtlas moves its listing pages, fix the URLs here and nothing else. */
const CUISINES = [
  { slug: 'india', name: 'India', countryCode: 'IN' },
  { slug: 'china', name: 'China', countryCode: 'CN' },
  { slug: 'thailand', name: 'Thailand', countryCode: 'TH' },
  { slug: 'indonesia', name: 'Indonesia', countryCode: 'ID' },
  { slug: 'japan', name: 'Japan', countryCode: 'JP' },
].map((c) => ({
  ...c,
  listUrls: [
    `${ORIGIN}/best-rated-dishes-in-${c.slug}`,
    `${ORIGIN}/100-most-popular-dishes-in-${c.slug}`,
  ],
}))

/* Root-level paths that are navigation, not dishes — a safety net under the
 * card-scoped harvest. */
const NON_DISH_PATHS = new Set([
  '', 'search', 'about', 'contact', 'privacy', 'terms', 'blog', 'awards',
  'best', 'map', 'login', 'register', 'app', 'quiz', 'events', 'news',
  'nearme', 'gourmet', 'recipes', 'where-to-eat', 'restaurants', 'food',
  'drinks', 'producers', 'products', 'experiences', 'rankings', 'lists',
  'certificates', 'places', 'foods',
  ...CUISINES.map((c) => c.slug),
])

interface DishRow {
  epic_slug: string
  slug: string
  name: string
  cuisine: string
  country_code: string | null
  region: string | null
  category: string | null
  description: string
  ingredients: string[]
  rating: number | null
  rating_count: number | null
  rank_in_cuisine: number | null
  image_url: string | null
  source_url: string
  tags: string[]
  scraped_at: string | null
}

/** One listing card, as extracted in the page. */
interface CardExtract {
  href: string
  name: string | null
  rank: number | null
  category: string | null
  region: string | null
  rating: number | null
  description: string | null
  imageUrl: string | null
}

interface ScrapeState {
  cuisines: Record<string, { dishUrls: string[]; discovered: boolean }>
  failed: string[]
}

const args = process.argv.slice(2)
const flag = (name: string): boolean => args.includes(name)
const opt = (name: string): string | null => {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null
}

const ONLY_CUISINE = opt('--cuisine')
const LIMIT = Number(opt('--limit') ?? 100)
const HEADED = flag('--headed')
const FORCE = flag('--force')
const DRY_RUN = flag('--dry-run')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const politeDelay = () => sleep(2000 + Math.random() * 2000)

/** Cloudflare interstitials ("Just a moment…") auto-solve in a real headed
 *  browser a few seconds after load — but the initial navigation still
 *  reports 403. After a blocked navigation, poll until the challenge clears
 *  (markers gone, real page showing) or the deadline passes. A hard block
 *  page ("Attention Required") never clears, so give up on it immediately. */
async function waitOutChallenge(page: Page, timeoutMs = 60000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await page
      .evaluate(() => {
        const t = document.title.toLowerCase()
        if (t.includes('attention required') || t.includes('access denied')) return 'blocked'
        if (
          t.includes('just a moment') ||
          document.querySelector('#challenge-form, #cf-chl-widget, [id^="cf-chl"]') !== null
        )
          return 'challenge'
        return 'clear'
      })
      .catch(() => 'challenge' as const) // eval fails mid-reload — still settling
    if (state === 'clear') return true
    if (state === 'blocked') return false
    await sleep(2000)
  }
  return false
}

function loadJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

/** Atomic write: temp file + rename, so an interrupt never corrupts the corpus. */
function saveJson(path: string, value: unknown): void {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tmp, path)
}

function saveDishes(dishes: Map<string, DishRow>): void {
  const cuisineOrder = new Map(CUISINES.map((c, i) => [c.slug, i]))
  const rows = [...dishes.values()].sort(
    (a, b) =>
      (cuisineOrder.get(a.cuisine) ?? 99) - (cuisineOrder.get(b.cuisine) ?? 99) ||
      (a.rank_in_cuisine ?? 9999) - (b.rank_in_cuisine ?? 9999) ||
      a.slug.localeCompare(b.slug)
  )
  saveJson(DISHES_JSON, rows)
}

/** Truncate at a sentence boundary, hard-capped at MAX_DESCRIPTION chars. */
function truncateDescription(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= MAX_DESCRIPTION) {
    // Keep at most the first two sentences even when short.
    const twoSentences = clean.match(/^.*?[.!?](?:\s+.*?[.!?])?(?=\s|$)/)
    return twoSentences ? twoSentences[0] : clean
  }
  const head = clean.slice(0, MAX_DESCRIPTION)
  const lastStop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '))
  if (lastStop > 80) return head.slice(0, lastStop + 1)
  return `${head.slice(0, head.lastIndexOf(' '))}…`
}

function dishSlugFromUrl(url: string): string | null {
  try {
    const u = new URL(url, ORIGIN)
    if (u.origin !== ORIGIN) return null
    const segments = u.pathname.split('/').filter(Boolean)
    // Dish pages are root-level single-segment slugs (/butter-garlic-naan).
    if (segments.length !== 1) return null
    // Case is meaningful: dish paths are lowercase; categories (/Flatbreads)
    // and restaurants (/KulchaLand) are capitalized. Reject before lowering.
    if (segments[0] !== segments[0].toLowerCase()) return null
    const slug = segments[0]
    if (NON_DISH_PATHS.has(slug)) return null
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null
    // Listing/rank pages masquerading as root slugs ("best-rated-dishes-in-x",
    // "100-most-popular-…", "where-to-eat-…") are navigation, not dishes.
    if (/^(\d+|best|top|most|where)-/.test(slug) || /-in-the-world$/.test(slug)) return null
    return slug
  } catch {
    return null
  }
}

/** Runs in the page: extract every top-list card in document order.
 *  Card anatomy (verified 2026-07-27):
 *    div.card.top-list-primary
 *      a.card__visual-link[href=/slug] > picture > img[src=cdn…]
 *      div.card__order "02"
 *      a.card__label "Flatbread"
 *      a[href=/slug] > h3 "Amritsari kulcha"
 *      div.card__location > a.fw-600 "Amritsar, India"
 *      div.card__info … span.card__info-value "4.4"
 *      div.card__description … p (full editorial text + inline buttons) */
async function harvestCards(page: Page): Promise<CardExtract[]> {
  return page.evaluate(() => {
    const out: CardExtract[] = []
    // .top-list-primary only: the page has a sibling .top-list-secondary
    // section of food PRODUCTS (spirits, teas, chocolate brands) whose cards
    // share the same anatomy and restart their own rank numbering.
    for (const card of document.querySelectorAll('.card.top-list-primary')) {
      const visual = card.querySelector<HTMLAnchorElement>('a.card__visual-link[href]')
      const titleLink = [...card.querySelectorAll<HTMLAnchorElement>('a[href]')].find((a) =>
        a.querySelector('h1, h2, h3, h4')
      )
      const href = (titleLink ?? visual)?.getAttribute('href')
      if (!href) continue

      const name =
        titleLink?.querySelector('h1, h2, h3, h4')?.textContent?.trim() || null

      const rankText = card.querySelector('[class*="card__order"]')?.textContent?.trim()
      const rank = rankText && /^\d+$/.test(rankText) ? Number(rankText) : null

      const ratingText = card.querySelector('[class*="card__info-value"]')?.textContent?.trim()
      const ratingNum = ratingText ? Number(ratingText) : NaN
      const rating = Number.isFinite(ratingNum) && ratingNum >= 0 && ratingNum <= 5 ? ratingNum : null

      // Description p contains inline expander buttons — strip them.
      let description: string | null = null
      const p = card.querySelector('[class*="card__description"] p')
      if (p) {
        const clone = p.cloneNode(true) as HTMLElement
        clone.querySelectorAll('button, a').forEach((el) => el.remove())
        description = clone.textContent?.trim() || null
      }

      const img = card.querySelector<HTMLImageElement>('[class*="card__visual"] img')

      out.push({
        href,
        name,
        rank,
        category: card.querySelector('[class*="card__label"]')?.textContent?.trim() || null,
        region: card.querySelector('[class*="card__location"] a')?.textContent?.trim() || null,
        rating,
        description,
        imageUrl: img?.src || null,
      })
    }
    return out
  })
}

/** Open one listing URL, wait for the cards to finish rendering, and return
 *  one complete row per dish found on it. */
async function scrapeListing(
  context: BrowserContext,
  cuisine: (typeof CUISINES)[number],
  listUrl: string
): Promise<DishRow[]> {
  const page = await context.newPage()
  try {
    {
      console.log(`[umami] ${cuisine.slug}: opening ${listUrl}`)
      const res = await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })
      if (res && res.status() >= 400) {
        console.warn(`[umami] ${cuisine.slug}: ${listUrl} → HTTP ${res.status()}, waiting out interstitial`)
        if (!(await waitOutChallenge(page))) {
          console.warn(`[umami] ${cuisine.slug}: ${listUrl} stayed blocked, skipping`)
          return []
        }
      }
      await sleep(6000) // htmx content settle

      // The listing serves AT MOST 20 dish cards to anonymous visitors —
      // there is no lazy-load or pagination for ranks 21+ (verified
      // 2026-07-27: 40 slow scroll steps grow nothing; the only hx-get
      // elements are menu drawers). Cards can still RENDER in two batches,
      // so wait (with a gentle scroll nudge) until the count stops changing.
      let stable = 0
      let last = 0
      for (let round = 0; round < 60 && stable < 8; round++) {
        await page.evaluate(() => window.scrollBy(0, 900)).catch(() => {})
        await sleep(800)
        const count = await page
          .evaluate(() => document.querySelectorAll('.card.top-list-primary').length)
          .catch(() => 0)
        if (count >= LIMIT) break
        stable = count === last ? stable + 1 : 0
        last = count
      }

      const cards = await harvestCards(page)
      const rows = new Map<string, DishRow>()
      for (const card of cards) {
        const slug = dishSlugFromUrl(card.href)
        if (!slug || rows.has(slug)) continue
        if (!card.name) continue
        rows.set(slug, {
          epic_slug: EPIC_SLUG,
          slug,
          name: card.name,
          cuisine: cuisine.slug,
          country_code: cuisine.countryCode,
          region: card.region,
          category: card.category,
          description: truncateDescription(card.description ?? card.name),
          ingredients: [], // not present on listing cards; dish pages are hard-403'd
          rating: card.rating,
          rating_count: null, // not present on listing cards
          rank_in_cuisine: card.rank ?? rows.size + 1,
          image_url: card.imageUrl,
          source_url: `${ORIGIN}/${slug}`,
          tags: [],
          scraped_at: new Date().toISOString(),
        })
        if (rows.size >= LIMIT) break
      }

      if (rows.size > 0) {
        console.log(`[umami] ${cuisine.slug}: captured ${rows.size} dishes from ${listUrl}`)
        return [...rows.values()]
      }
    }
    console.warn(
      `[umami] ${cuisine.slug}: 0 dishes captured from ${listUrl} — card markup drifted? fix harvestCards and re-run`
    )
    return []
  } finally {
    await page.close()
  }
}

/** Fresh identity per launch: Cloudflare passes a brand-new profile's first
 *  navigation, but a profile reused across browser launches gets challenged
 *  on every request (its cookies no longer match the new session) and
 *  challenges never clear under automation. Wiping + relaunching per cuisine
 *  makes every listing load a first navigation from a clean profile — the
 *  one flow that reliably passes. */
async function launchFreshContext(): Promise<BrowserContext> {
  rmSync(PROFILE_DIR, { recursive: true, force: true })
  const launchOpts = { headless: !HEADED, viewport: { width: 1440, height: 900 } }
  try {
    // Real Chrome passes Cloudflare where the bundled Chromium build is
    // fingerprint-blocked (both verified 2026-07-27).
    return await chromium.launchPersistentContext(PROFILE_DIR, { ...launchOpts, channel: 'chrome' })
  } catch (err) {
    console.warn(
      `[umami] system Chrome unavailable (${err instanceof Error ? err.message.split('\n')[0] : err}) — using bundled Chromium (worse Cloudflare odds)`
    )
    return chromium.launchPersistentContext(PROFILE_DIR, launchOpts)
  }
}

/* ── main ─────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const targets = CUISINES.filter((c) => !ONLY_CUISINE || c.slug === ONLY_CUISINE)
  if (targets.length === 0) {
    throw new Error(`unknown --cuisine "${ONLY_CUISINE}" (expected one of ${CUISINES.map((c) => c.slug).join('|')})`)
  }

  mkdirSync(DATA_DIR, { recursive: true })
  const state = loadJson<ScrapeState>(STATE_JSON, { cuisines: {}, failed: [] })
  const dishes = new Map<string, DishRow>(
    loadJson<DishRow[]>(DISHES_JSON, []).map((d) => [d.slug, d])
  )
  const preexisting = dishes.size
  console.log(`[umami] ${preexisting} dishes already in dishes.json (resume skips them${FORCE ? '' : '; --force to refresh'})`)

  let scraped = 0
  try {
    for (const cuisine of targets) {
      // Union both listings: best-rated is the canonical ranking; the
      // most-popular list mostly overlaps but contributes extra dishes,
      // which carry no best-rated rank and a listed-in:most-popular tag.
      // Each listing gets its own fresh context (see launchFreshContext).
      const seen = new Set<string>()
      const rows: DishRow[] = []
      for (const [listIndex, listUrl] of cuisine.listUrls.entries()) {
        const context = await launchFreshContext()
        let listRows: DishRow[] = []
        try {
          listRows = await scrapeListing(context, cuisine, listUrl)
        } finally {
          await context.close()
        }
        for (const row of listRows) {
          if (seen.has(row.slug)) continue
          seen.add(row.slug)
          if (listIndex > 0) {
            row.rank_in_cuisine = null
            row.tags = ['listed-in:most-popular']
          }
          rows.push(row)
        }
        await politeDelay()
      }
      state.cuisines[cuisine.slug] = {
        dishUrls: rows.map((r) => r.source_url),
        discovered: rows.length > 0,
      }

      if (!DRY_RUN) {
        for (const row of rows) {
          const existing = dishes.get(row.slug)
          if (existing && !FORCE) {
            // Cross-cuisine duplicate: record the second membership, keep one row.
            if (existing.cuisine !== row.cuisine) {
              const tag = `listed-in:${row.cuisine}`
              if (!existing.tags.includes(tag)) {
                existing.tags.push(tag)
                console.warn(`[umami] ${row.slug}: already captured under "${existing.cuisine}", tagged ${tag}`)
              }
            }
            continue
          }
          if (existing && FORCE && existing.cuisine !== row.cuisine) {
            row.tags = existing.tags // keep accumulated listed-in tags on refresh
          }
          dishes.set(row.slug, row)
          scraped++
        }
        saveDishes(dishes)
        saveJson(STATE_JSON, state)
      }
      await politeDelay()
    }
  } finally {
    if (!DRY_RUN) {
      saveDishes(dishes)
      saveJson(STATE_JSON, state)
      console.log(`[umami] done: +${scraped} captured this run, ${dishes.size} total in dishes.json`)
    } else {
      console.log('[umami] dry run complete (no writes)')
    }
  }
}

main().catch((err) => {
  console.error('[umami] failed:', err)
  process.exit(1)
})
