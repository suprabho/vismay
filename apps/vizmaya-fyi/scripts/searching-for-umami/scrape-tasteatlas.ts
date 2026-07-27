/**
 * Searching for Umami scraper — walks TasteAtlas's per-cuisine "best rated
 * dishes" listings for five Asian cuisines (India, China, Thailand, Indonesia,
 * Japan), visits each dish page, and writes one JSON row per dish into
 * vizmaya-data/searching-for-umami/dishes.json (the importer's input).
 *
 * LOCAL-RUN ONLY. TasteAtlas sits behind Cloudflare and blocks datacenter IPs
 * — the dev sandbox and GitHub Actions runners both are one — so this script
 * must run on a residential connection. It is deliberately split from the
 * importer (same stance as seriously-curious): the scraper writes only the
 * corpus JSON, never the DB.
 *
 * Run locally (from apps/vizmaya-fyi; needs `npx playwright install chromium`):
 *   pnpm searching-for-umami:scrape --cuisine india --limit 5 --headed   # smoke test
 *   pnpm searching-for-umami:scrape                                     # full run (~35–45 min)
 *
 * Flags:
 *   --cuisine <slug>  only this cuisine (india|china|thailand|indonesia|japan)
 *   --limit N         dishes per cuisine (default 100)
 *   --headed          visible browser — use on the first run to click through
 *                     any Cloudflare interstitial; the persistent profile in
 *                     vizmaya-data/searching-for-umami/.browser-profile keeps
 *                     the clearance for later headless runs
 *   --force           re-fetch dishes already present in dishes.json
 *   --dry-run         phase 1 only: discover listing URLs, print counts, no writes
 *
 * Resumability: discovered dish URLs checkpoint to scrape-state.json per
 * cuisine; dishes already in dishes.json are skipped (unless --force);
 * dishes.json is rewritten atomically (temp + rename) every SAVE_EVERY dishes
 * and on exit. Kill and re-run freely.
 *
 * Politeness: sequential navigation (concurrency 1), randomized 2–4 s delay
 * between pages, no UA spoofing beyond the real browser's own, abort after 3
 * consecutive 403/429s. Do not parallelize.
 *
 * Rights: descriptions are cut at a sentence boundary and hard-capped at
 * MAX_DESCRIPTION chars — never the full editorial text. source_url carries
 * attribution. The importer re-enforces this bound.
 *
 * Extraction is defensive by design — TasteAtlas is an Angular SPA whose
 * markup/API can drift. Phase 1 prefers the internal /api/ JSON the SPA loads
 * listings from, falling back to DOM scraping of rendered cards; phase 2
 * layers JSON-LD → meta tags → DOM heuristics per field. If a run comes back
 * with sparse fields, fix the selectors/urls in the marked blocks below and
 * re-run — resume skips everything already captured.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
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
const SAVE_EVERY = 10
const MAX_DESCRIPTION = 400
const MAX_CONSECUTIVE_BLOCKS = 3

/* ── Cuisine config — editable data, no logic below depends on its shape ──
 * listUrls are tried in order until one yields dishes; if TasteAtlas moves
 * its listing pages, fix the URLs here and nothing else. */
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
    `${ORIGIN}/${c.slug}`,
  ],
}))

/* Root-level paths that are navigation, not dishes — used by the DOM-scrape
 * fallback to filter listing anchors. */
const NON_DISH_PATHS = new Set([
  '', 'search', 'about', 'contact', 'privacy', 'terms', 'blog', 'awards',
  'best', 'map', 'login', 'register', 'app', 'quiz', 'events', 'news',
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

/** Phase-1 listing hit: what we learn about a dish before visiting its page. */
interface Listing {
  url: string
  slug: string
  name: string | null
  rating: number | null
  ratingCount: number | null
  rank: number
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
    const slug = segments[0].toLowerCase()
    if (NON_DISH_PATHS.has(slug)) return null
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null
    return slug
  } catch {
    return null
  }
}

/* ── Phase 1 — discover: cuisine listing → dish URLs ─────────────────────── */

/** Recursively harvest listing-like entries from a captured /api/ payload.
 *  The SPA's internal API shape isn't a contract — we look for any object
 *  carrying a TasteAtlas-style url/link plus a name, and read rating fields
 *  opportunistically. */
function harvestFromApiPayload(payload: unknown, out: Map<string, Listing>): void {
  if (Array.isArray(payload)) {
    for (const item of payload) harvestFromApiPayload(item, out)
    return
  }
  if (payload === null || typeof payload !== 'object') return
  const o = payload as Record<string, unknown>

  const urlish = [o.UrlLink, o.urlLink, o.Url, o.url, o.Link, o.link].find(
    (v): v is string => typeof v === 'string'
  )
  const nameish = [o.Name, o.name, o.Title, o.title].find(
    (v): v is string => typeof v === 'string'
  )
  const slug = urlish ? dishSlugFromUrl(urlish) : null
  if (slug && nameish) {
    const num = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : null
    const existing = out.get(slug)
    if (!existing) {
      out.set(slug, {
        url: `${ORIGIN}/${slug}`,
        slug,
        name: nameish,
        rating: num(o.Rating) ?? num(o.rating) ?? num(o.Stars) ?? null,
        ratingCount: num(o.RatingCount) ?? num(o.ratingCount) ?? num(o.Votes) ?? null,
        rank: out.size + 1,
      })
    }
  }
  for (const v of Object.values(o)) {
    if (v !== null && typeof v === 'object') harvestFromApiPayload(v, out)
  }
}

/** DOM fallback: after auto-scrolling the listing, collect root-level dish
 *  anchors in document order. */
async function harvestFromDom(page: Page, out: Map<string, Listing>): Promise<void> {
  const anchors = await page.$$eval('a[href]', (els) =>
    els.map((a) => ({ href: (a as HTMLAnchorElement).href, text: a.textContent?.trim() ?? '' }))
  )
  for (const a of anchors) {
    const slug = dishSlugFromUrl(a.href)
    if (!slug || out.has(slug)) continue
    out.set(slug, {
      url: `${ORIGIN}/${slug}`,
      slug,
      name: a.text || null,
      rating: null,
      ratingCount: null,
      rank: out.size + 1,
    })
  }
}

async function discoverCuisine(
  context: BrowserContext,
  cuisine: (typeof CUISINES)[number]
): Promise<Listing[]> {
  const page = await context.newPage()
  const found = new Map<string, Listing>()

  // Capture the SPA's own listing API responses — the cleanest data source.
  page.on('response', (res) => {
    if (!res.url().includes('/api/')) return
    res
      .json()
      .then((json) => harvestFromApiPayload(json, found))
      .catch(() => {}) // non-JSON api responses are fine to ignore
  })

  try {
    for (const listUrl of cuisine.listUrls) {
      console.log(`[umami] ${cuisine.slug}: opening ${listUrl}`)
      const res = await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })
      if (res && res.status() >= 400) {
        console.warn(`[umami] ${cuisine.slug}: ${listUrl} → HTTP ${res.status()}, trying next url`)
        continue
      }
      await sleep(4000) // let the SPA hydrate + fire its listing XHRs

      // Lazy-loaded listings grow on scroll: keep scrolling until the count
      // stops growing or we have enough.
      let stable = 0
      let last = 0
      while (found.size < LIMIT && stable < 3) {
        await page.mouse.wheel(0, 2500)
        await sleep(1500)
        await harvestFromDom(page, found)
        stable = found.size === last ? stable + 1 : 0
        last = found.size
      }
      if (found.size > 0) break
    }
  } finally {
    await page.close()
  }

  const listings = [...found.values()].slice(0, LIMIT)
  if (listings.length === 0) {
    console.warn(
      `[umami] ${cuisine.slug}: 0 dishes discovered — listing URLs or markup drifted; fix CUISINES/listUrls or the harvest selectors and re-run`
    )
  } else {
    console.log(`[umami] ${cuisine.slug}: discovered ${listings.length} dishes`)
  }
  return listings
}

/* ── Phase 2 — detail: dish page → DishRow fields ────────────────────────── */

interface DetailExtract {
  name: string | null
  description: string | null
  region: string | null
  category: string | null
  ingredients: string[]
  rating: number | null
  ratingCount: number | null
  imageUrl: string | null
}

/** Runs in the page: JSON-LD → meta tags → DOM heuristics, most-trusted first. */
async function extractDetail(page: Page): Promise<DetailExtract> {
  return page.evaluate(() => {
    const out = {
      name: null as string | null,
      description: null as string | null,
      region: null as string | null,
      category: null as string | null,
      ingredients: [] as string[],
      rating: null as number | null,
      ratingCount: null as number | null,
      imageUrl: null as string | null,
    }

    // 1. JSON-LD (schema.org), when present.
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(script.textContent ?? '')
        for (const node of Array.isArray(data) ? data : [data]) {
          if (!node || typeof node !== 'object') continue
          out.name ||= typeof node.name === 'string' ? node.name : null
          out.description ||= typeof node.description === 'string' ? node.description : null
          out.imageUrl ||=
            typeof node.image === 'string'
              ? node.image
              : typeof node.image?.url === 'string'
                ? node.image.url
                : null
          const agg = node.aggregateRating
          if (agg && typeof agg === 'object') {
            const val = Number(agg.ratingValue)
            const cnt = Number(agg.ratingCount ?? agg.reviewCount)
            if (Number.isFinite(val)) out.rating ??= val
            if (Number.isFinite(cnt)) out.ratingCount ??= cnt
          }
          if (Array.isArray(node.recipeIngredient)) {
            out.ingredients = node.recipeIngredient.filter((x: unknown) => typeof x === 'string')
          }
        }
      } catch {
        /* malformed JSON-LD — ignore */
      }
    }

    // 2. Meta tags.
    const meta = (sel: string) =>
      document.querySelector<HTMLMetaElement>(sel)?.content?.trim() || null
    out.name ||= meta('meta[property="og:title"]')
    out.description ||= meta('meta[name="description"]') || meta('meta[property="og:description"]')
    out.imageUrl ||= meta('meta[property="og:image"]')

    // 3. DOM heuristics (Angular SPA — class names may drift; keep loose).
    out.name ||= document.querySelector('h1')?.textContent?.trim() || null
    if (!out.description) {
      const p = document.querySelector('[class*="description" i] p, main p, article p')
      out.description = p?.textContent?.trim() || null
    }
    // "Main ingredients" chips: find the heading, harvest sibling links/chips.
    if (out.ingredients.length === 0) {
      for (const h of document.querySelectorAll('h2, h3, h4, [class*="title" i]')) {
        if (!/main ingredients/i.test(h.textContent ?? '')) continue
        const scope = h.parentElement ?? h
        out.ingredients = [...scope.querySelectorAll('a, li, [class*="chip" i]')]
          .map((el) => el.textContent?.trim() ?? '')
          .filter((t) => t && t.length < 40 && !/main ingredients/i.test(t))
        if (out.ingredients.length > 0) break
      }
    }
    // Rating widget: first 0–5 float near a rate/star element.
    if (out.rating === null) {
      const el = document.querySelector('[class*="rating" i], [class*="rate" i], [class*="star" i]')
      const m = el?.textContent?.match(/([0-4]\.\d|5\.0|[0-5])\s*$/m)
      if (m) {
        const val = Number(m[1])
        if (Number.isFinite(val) && val >= 0 && val <= 5) out.rating = val
      }
    }
    // Origin breadcrumb: locality links preceding the h1 usually name
    // region/country ("Punjab, India").
    const origin = document.querySelector('[class*="origin" i], [class*="location" i], [class*="breadcrumb" i]')
    if (origin) {
      const parts = [...origin.querySelectorAll('a, span')]
        .map((el) => el.textContent?.trim() ?? '')
        .filter((t) => t && t.length < 60)
      if (parts.length > 0) out.region = [...new Set(parts)].join(', ')
    }
    // Food-type chip: a link to a category listing near the top of the page.
    const cat = document.querySelector('a[href*="-in-the-world" i], [class*="category" i] a, [class*="subtitle" i] a')
    out.category ||= cat?.textContent?.trim() || null

    return out
  })
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

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: !HEADED,
    viewport: { width: 1440, height: 900 },
  })

  let scraped = 0
  let consecutiveBlocks = 0

  try {
    for (const cuisine of targets) {
      // Phase 1 — discover (checkpointed per cuisine).
      let cState = state.cuisines[cuisine.slug]
      let listings: Listing[]
      if (cState?.discovered && !FORCE) {
        listings = cState.dishUrls.map((url, i) => ({
          url,
          slug: dishSlugFromUrl(url) ?? url,
          name: null,
          rating: null,
          ratingCount: null,
          rank: i + 1,
        }))
        console.log(`[umami] ${cuisine.slug}: ${listings.length} dish urls from checkpoint`)
      } else {
        listings = await discoverCuisine(context, cuisine)
        cState = { dishUrls: listings.map((l) => l.url), discovered: listings.length > 0 }
        state.cuisines[cuisine.slug] = cState
        saveJson(STATE_JSON, state)
        await politeDelay()
      }

      if (DRY_RUN) continue

      // Phase 2 — detail.
      for (const listing of listings) {
        const existing = dishes.get(listing.slug)
        if (existing && !FORCE) {
          // Cross-cuisine duplicate: record the second membership, keep one row.
          if (existing.cuisine !== cuisine.slug) {
            const tag = `listed-in:${cuisine.slug}`
            if (!existing.tags.includes(tag)) {
              existing.tags.push(tag)
              console.warn(`[umami] ${listing.slug}: already scraped under "${existing.cuisine}", tagged ${tag}`)
            }
          }
          continue
        }

        const page = await context.newPage()
        try {
          const res = await page.goto(listing.url, { waitUntil: 'domcontentloaded', timeout: 45000 })
          const status = res?.status() ?? 0
          if (status === 403 || status === 429) {
            consecutiveBlocks++
            console.warn(`[umami] ${listing.url} → HTTP ${status} (${consecutiveBlocks}/${MAX_CONSECUTIVE_BLOCKS})`)
            if (consecutiveBlocks >= MAX_CONSECUTIVE_BLOCKS) {
              throw new Error(
                `aborting: ${MAX_CONSECUTIVE_BLOCKS} consecutive ${status}s — likely bot-blocked. ` +
                  'Re-run with --headed to clear the interstitial (progress is saved).'
              )
            }
            await sleep(15000 * consecutiveBlocks) // back off before the next attempt
            continue
          }
          consecutiveBlocks = 0
          await sleep(2500) // SPA hydration

          const detail = await extractDetail(page)
          const name = detail.name ?? listing.name
          if (!name) {
            console.warn(`[umami] ${listing.slug}: no name extracted, recording as failed`)
            if (!state.failed.includes(listing.url)) state.failed.push(listing.url)
            continue
          }

          dishes.set(listing.slug, {
            epic_slug: EPIC_SLUG,
            slug: listing.slug,
            name,
            cuisine: cuisine.slug,
            country_code: cuisine.countryCode,
            region: detail.region,
            category: detail.category,
            description: truncateDescription(detail.description ?? name),
            ingredients: detail.ingredients,
            rating: detail.rating ?? listing.rating,
            rating_count: detail.ratingCount ?? listing.ratingCount,
            rank_in_cuisine: listing.rank,
            image_url: detail.imageUrl,
            source_url: listing.url,
            tags: [],
            scraped_at: new Date().toISOString(),
          })
          scraped++
          console.log(`[umami] ${cuisine.slug} ${listing.rank}/${listings.length}: ${name}`)

          if (scraped % SAVE_EVERY === 0) {
            saveDishes(dishes)
            saveJson(STATE_JSON, state)
          }
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('aborting:')) throw err
          console.warn(`[umami] ${listing.url} failed: ${err instanceof Error ? err.message : err}`)
          if (!state.failed.includes(listing.url)) state.failed.push(listing.url)
        } finally {
          await page.close()
        }
        await politeDelay()
      }
    }
  } finally {
    if (!DRY_RUN) {
      saveDishes(dishes)
      saveJson(STATE_JSON, state)
      console.log(
        `[umami] done: +${scraped} scraped this run, ${dishes.size} total in dishes.json` +
          (state.failed.length ? `, ${state.failed.length} failed urls in scrape-state.json` : '')
      )
    }
    await context.close()
  }
}

main().catch((err) => {
  console.error('[umami] failed:', err)
  process.exit(1)
})
