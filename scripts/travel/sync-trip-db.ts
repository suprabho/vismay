/**
 * Sync a trip's generated `.trip.yaml` itinerary into the
 * `travel_trips.itinerary` jsonb mirror (migration 076) — what admin compose
 * and the shared render surface's canvas frames read (they don't have the
 * travel app's filesystem).
 *
 *   pnpm travel:sync-trip-db --slug new-york-2026 [--dry-run]
 *
 * Always overwrites the mirror (the yaml is the generated source of truth;
 * there are no hand edits to preserve). Never touches name/password/status
 * on an existing row.
 *
 * Env (same pair every server-side Supabase caller uses):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { upsertItineraryDb, type ItineraryDoc } from './itinerary-db'

async function main() {
  const args = process.argv.slice(2)
  const getFlag = (name: string) => {
    const idx = args.indexOf(`--${name}`)
    return idx >= 0 ? args[idx + 1] : undefined
  }
  const slug = getFlag('slug')
  const dryRun = args.includes('--dry-run')
  if (!slug) {
    console.error('usage: pnpm travel:sync-trip-db --slug <trip-slug> [--dry-run]')
    process.exit(1)
  }

  const tripYamlPath = path.join(
    process.cwd(),
    'apps/travel/web/content/stories',
    `${slug}.trip.yaml`
  )
  if (!fs.existsSync(tripYamlPath)) {
    console.error(`No itinerary at ${tripYamlPath}`)
    process.exit(1)
  }
  const itinerary = YAML.parse(fs.readFileSync(tripYamlPath, 'utf8')) as ItineraryDoc | null
  if (!itinerary || !Array.isArray(itinerary.days)) {
    console.error(`${tripYamlPath} parsed empty or without days[] — refusing to sync.`)
    process.exit(1)
  }

  const days = (itinerary.days as unknown[]).length
  const stops = (itinerary.days as Array<{ stops?: unknown[] }>).reduce(
    (n, d) => n + (d.stops?.length ?? 0),
    0
  )
  if (dryRun) {
    console.log(`[dry-run] would sync ${slug}: ${days} day(s), ${stops} stop(s).`)
    return
  }

  const outcome = await upsertItineraryDb(slug, itinerary)
  console.log(
    `Done: itinerary ${outcome} for ${slug} (${days} day(s), ${stops} stop(s)).` +
      (outcome === 'inserted'
        ? ' Trip row was created locked — run travel:set-password to open the gate.'
        : '')
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
