/**
 * Seriously Curious importer — reads the scraped articles.json in
 * vizmaya-data/seriously-curious and upserts into book_articles (migration 068).
 *
 *   vizmaya-data/seriously-curious/articles.json → book_articles (109 rows)
 *
 * Run locally:  pnpm seriously-curious:import
 *
 * Required env (loaded from apps/vizmaya-fyi/.env.local / .env):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — write access
 *
 * Idempotency: upsert on (epic_slug, slug). Re-runs only touch rows whose
 * payload changed. The PDF scrape/tag step lives in
 * vizmaya-data/seriously-curious/INGEST_NOTES.md — this script only loads the
 * already-extracted JSON, so it's deterministic and needs no PDF tooling.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PKG_DIR = resolve(SCRIPT_DIR, '../../')
const REPO_ROOT = resolve(SCRIPT_DIR, '../../../../')

loadEnv({ path: resolve(PKG_DIR, '.env.local') })
loadEnv({ path: resolve(PKG_DIR, '.env') })

const ARTICLES_JSON = resolve(REPO_ROOT, 'vizmaya-data/seriously-curious/articles.json')
const BATCH_SIZE = 50

interface ArticleRow {
  epic_slug: string
  book_name: string
  slug: string
  section: string
  section_index: number
  article_index: number
  title: string
  page_start: number | null
  page_end: number | null
  char_count: number | null
  entities: string[]
  keywords: string[]
  facts: string[]
  body: string
}

/** Read + validate articles.json into typed rows (throws on the first bad row). */
function readArticles(): ArticleRow[] {
  if (!existsSync(ARTICLES_JSON)) throw new Error(`missing ${ARTICLES_JSON}`)
  const raw = JSON.parse(readFileSync(ARTICLES_JSON, 'utf8')) as unknown
  if (!Array.isArray(raw)) throw new Error('articles.json is not an array')

  return raw.map((r, i): ArticleRow => {
    const a = r as Record<string, unknown>
    const req = (k: string): string => {
      const v = a[k]
      if (typeof v !== 'string' || v.trim() === '') {
        throw new Error(`articles.json[${i}] missing string field "${k}"`)
      }
      return v
    }
    const strArr = (k: string): string[] =>
      Array.isArray(a[k]) ? (a[k] as unknown[]).filter((x): x is string => typeof x === 'string') : []
    const intOrNull = (k: string): number | null => {
      const v = a[k]
      return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null
    }
    return {
      epic_slug: req('epic_slug'),
      book_name: req('book_name'),
      slug: req('slug'),
      section: req('section'),
      section_index: intOrNull('section_index') ?? 0,
      article_index: intOrNull('article_index') ?? 0,
      title: req('title'),
      page_start: intOrNull('page_start'),
      page_end: intOrNull('page_end'),
      char_count: intOrNull('char_count'),
      entities: strArr('entities'),
      keywords: strArr('keywords'),
      facts: strArr('facts'),
      body: req('body'),
    }
  })
}

async function upsertArticles(rows: ArticleRow[]): Promise<void> {
  if (rows.length === 0) return
  const sb = createServiceClient()
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await sb
      .from('book_articles')
      .upsert(batch, { onConflict: 'epic_slug,slug', ignoreDuplicates: false })
    if (error) throw new Error(`upsert book_articles: ${error.message}`)
  }
}

async function main(): Promise<void> {
  const rows = readArticles()
  const sections = new Set(rows.map((r) => r.section)).size
  console.log(`[seriously-curious] parsed ${rows.length} articles across ${sections} sections`)

  await upsertArticles(rows)
  console.log(`[seriously-curious] upserted ${rows.length} articles into book_articles`)
}

main().catch((err) => {
  console.error('[seriously-curious] failed:', err)
  process.exit(1)
})
