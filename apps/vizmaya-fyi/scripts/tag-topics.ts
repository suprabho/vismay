/**
 * Backfill `topic:` onto existing vizmaya-fyi stories — DB-targeted.
 *
 * This is the batched equivalent of opening each story in the admin and saving:
 * it reads the CURRENT markdown blob from Postgres (the source of truth),
 * injects only the `topic` frontmatter key, and writes it back through the
 * content-source `writeMarkdown` (which upserts the blob + re-syncs the
 * denormalized title/status/listed/aura columns; `onConflict` leaves every
 * other column — config_yaml, display_order, app_slug, theme, … — untouched).
 *
 * It is DB-sourced (NOT a fs→db sync) and idempotent. Dry-run by default.
 *
 *   audit/dry-run:  CONTENT_SOURCE=db npx tsx scripts/tag-topics.ts
 *   write:          CONTENT_SOURCE=db npx tsx scripts/tag-topics.ts --apply
 */
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

import matter from 'gray-matter'
import { stringify } from 'yaml'
import { getContentSource } from '@vismay/content-source/contentSource'

/** slug → primary topic. Taxonomy: Markets · Society · Energy · Geopolitics ·
 *  Technology · Politics · History · Health. */
const TOPICS: Record<string, string> = {
  // Markets
  'currency-rankings-2026': 'Markets',
  'gdp-growth-2026': 'Markets',
  'who-owns-americas-debt': 'Markets',
  'spacex-ipo-2026': 'Markets',
  'airtel-fy26': 'Markets',
  // Society
  'press-freedom-2026': 'Society',
  'american-cost-divide': 'Society',
  'american-economic-divide': 'Society',
  'projected-population-2050': 'Society',
  'housing-trends-europe': 'Society',
  'india-exam-leaks': 'Society',
  // Energy
  'south-korea-gpu-hour': 'Energy',
  'top-car-brand-2026': 'Energy',
  'india-fuel-prices-2026': 'Energy',
  'iea-oil-may-2026': 'Energy',
  'india-aviation-cut-2026': 'Energy',
  // Geopolitics
  'the-century-trade-story': 'Geopolitics',
  'india-italy-meloni-era': 'Geopolitics',
  'great-nicobar-project': 'Geopolitics',
  'india-compounding-crises-2026': 'Geopolitics',
  // Technology
  'stargate-real-constraint': 'Technology',
  'europe-ai-adoption-2026': 'Technology',
  // singletons
  'delimitation-2011-census': 'Politics',
  'kashmir-1941-land-reform': 'History',
  'ebola-2026': 'Health',
}

async function main() {
  const mode = (process.env.CONTENT_SOURCE ?? 'fs').toLowerCase()
  if (mode !== 'db') {
    console.error('Refusing to run: set CONTENT_SOURCE=db (this script targets Postgres).')
    process.exit(1)
  }
  const apply = process.argv.includes('--apply')
  const src = getContentSource()

  let changed = 0
  let missing = 0
  for (const [slug, topic] of Object.entries(TOPICS)) {
    const raw = await src.readMarkdown(slug)
    if (raw == null) {
      console.warn(`!  ${slug}: not in DB — skipped`)
      missing++
      continue
    }
    const { data, content } = matter(raw)
    const before = (data.topic as string | undefined) ?? '—'
    if (before === topic) {
      console.log(`·  ${slug}: already ${topic}`)
      continue
    }
    data.topic = topic
    const updated = `---\n${stringify(data)}---\n${content}`
    if (apply) {
      await src.writeMarkdown(slug, updated)
      console.log(`✓  ${slug}: ${before} → ${topic}`)
    } else {
      console.log(`DRY ${slug}: ${before} → ${topic}`)
    }
    changed++
  }
  console.log(
    `\n${apply ? 'Applied' : 'Would change'} ${changed} stor${changed === 1 ? 'y' : 'ies'}` +
      (missing ? `, ${missing} missing` : '') +
      (apply ? '.' : '. Re-run with --apply to write.')
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
