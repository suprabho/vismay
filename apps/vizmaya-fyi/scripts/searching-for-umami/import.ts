/**
 * Searching for Umami importer — reads the scraped dishes.json in
 * vizmaya-data/searching-for-umami and upserts into food_dishes (migration 069).
 *
 *   vizmaya-data/searching-for-umami/dishes.json → food_dishes
 *
 * Run locally:  pnpm searching-for-umami:import [--dry-run]
 *   --dry-run   validate + print counts without touching Supabase (no env needed)
 *
 * Required env (loaded from apps/vizmaya-fyi/.env.local / .env):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — write access
 *
 * Idempotency: upsert on (epic_slug, slug). Re-runs only touch rows whose
 * payload changed. The TasteAtlas scrape step lives in
 * vizmaya-data/searching-for-umami/INGEST_NOTES.md (local-run scraper — the
 * site blocks datacenter IPs); this script only loads the already-extracted
 * JSON, so it's deterministic and needs no browser tooling.
 *
 * Rights guard: descriptions must stay truncated summaries — this importer
 * hard-fails on any description over 600 chars (the scraper caps at ~400).
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PKG_DIR = resolve(SCRIPT_DIR, '../../')
const REPO_ROOT = resolve(SCRIPT_DIR, '../../../../')

loadEnv({ path: resolve(PKG_DIR, '.env.local') })
loadEnv({ path: resolve(PKG_DIR, '.env') })

const DISHES_JSON = resolve(REPO_ROOT, 'vizmaya-data/searching-for-umami/dishes.json')
const BATCH_SIZE = 50
const EPIC_SLUG = 'searching-for-umami'
const KNOWN_CUISINES = new Set(['india', 'china', 'thailand', 'indonesia', 'japan'])
const MAX_DESCRIPTION_CHARS = 600

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

/** Read + validate dishes.json into typed rows (throws on the first bad row). */
function readDishes(): DishRow[] {
  if (!existsSync(DISHES_JSON)) throw new Error(`missing ${DISHES_JSON}`)
  const raw = JSON.parse(readFileSync(DISHES_JSON, 'utf8')) as unknown
  if (!Array.isArray(raw)) throw new Error('dishes.json is not an array')

  const seenSlugs = new Set<string>()

  return raw.map((r, i): DishRow => {
    const d = r as Record<string, unknown>
    const req = (k: string): string => {
      const v = d[k]
      if (typeof v !== 'string' || v.trim() === '') {
        throw new Error(`dishes.json[${i}] missing string field "${k}"`)
      }
      return v
    }
    const strOrNull = (k: string): string | null => {
      const v = d[k]
      return typeof v === 'string' && v.trim() !== '' ? v : null
    }
    const strArr = (k: string): string[] =>
      Array.isArray(d[k]) ? (d[k] as unknown[]).filter((x): x is string => typeof x === 'string') : []
    const intOrNull = (k: string): number | null => {
      const v = d[k]
      return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null
    }

    const epicSlug = req('epic_slug')
    if (epicSlug !== EPIC_SLUG) {
      throw new Error(`dishes.json[${i}] epic_slug "${epicSlug}" ≠ "${EPIC_SLUG}"`)
    }

    const slug = req('slug')
    if (seenSlugs.has(slug)) {
      // Duplicate conflict keys inside one upsert batch error out — and would
      // otherwise silently drop rows. Cross-cuisine dupes belong in `tags`.
      throw new Error(`dishes.json[${i}] duplicate slug "${slug}"`)
    }
    seenSlugs.add(slug)

    const cuisine = req('cuisine')
    if (!KNOWN_CUISINES.has(cuisine)) {
      // Warn-only: the table is food-generic, a sixth cuisine is legal.
      console.warn(`[searching-for-umami] dishes.json[${i}] unknown cuisine "${cuisine}"`)
    }

    const description = req('description')
    if (description.length > MAX_DESCRIPTION_CHARS) {
      throw new Error(
        `dishes.json[${i}] "${slug}" description is ${description.length} chars (max ${MAX_DESCRIPTION_CHARS} — keep summaries truncated, see rights note)`
      )
    }

    let rating: number | null = null
    if (typeof d.rating === 'number' && Number.isFinite(d.rating)) {
      if (d.rating < 0 || d.rating > 5) {
        throw new Error(`dishes.json[${i}] "${slug}" rating ${d.rating} outside 0–5`)
      }
      rating = d.rating
    }

    return {
      epic_slug: epicSlug,
      slug,
      name: req('name'),
      cuisine,
      country_code: strOrNull('country_code'),
      region: strOrNull('region'),
      category: strOrNull('category'),
      description,
      ingredients: strArr('ingredients'),
      rating,
      rating_count: intOrNull('rating_count'),
      rank_in_cuisine: intOrNull('rank_in_cuisine'),
      image_url: strOrNull('image_url'),
      source_url: req('source_url'),
      tags: strArr('tags'),
      scraped_at: strOrNull('scraped_at'),
    }
  })
}

async function upsertDishes(rows: DishRow[]): Promise<void> {
  if (rows.length === 0) return
  const { createServiceClient } = await import('@vismay/content-source/supabase')
  const sb = createServiceClient()
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await sb
      .from('food_dishes')
      .upsert(batch, { onConflict: 'epic_slug,slug', ignoreDuplicates: false })
    if (error) throw new Error(`upsert food_dishes: ${error.message}`)
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')

  const rows = readDishes()
  const byCuisine = new Map<string, number>()
  for (const r of rows) byCuisine.set(r.cuisine, (byCuisine.get(r.cuisine) ?? 0) + 1)
  const breakdown = [...byCuisine.entries()].map(([c, n]) => `${c}: ${n}`).join(', ')
  const sampleRows = rows.filter((r) => r.tags.includes('sample-data')).length
  console.log(`[searching-for-umami] parsed ${rows.length} dishes (${breakdown})`)
  if (sampleRows > 0) {
    console.warn(`[searching-for-umami] ${sampleRows}/${rows.length} rows are tagged sample-data — run the real scrape before publishing (INGEST_NOTES.md)`)
  }

  if (dryRun) {
    console.log('[searching-for-umami] --dry-run: validation passed, skipping upsert')
    return
  }

  await upsertDishes(rows)
  console.log(`[searching-for-umami] upserted ${rows.length} dishes into food_dishes`)
}

main().catch((err) => {
  console.error('[searching-for-umami] failed:', err)
  process.exit(1)
})
