/**
 * Seed/sync a trip's media manifest from git YAML into the `travel_trip_media`
 * table (migration 074) — the DB the deployed app curates against.
 *
 *   pnpm travel:sync-media-db --slug new-york-2026 [--dry-run] [--force]
 *
 * Insert-only by default: rows already in the DB are left untouched so a
 * re-run after prepare-media/upload-media never clobbers curation edits
 * (day/stop fixes, captions, deselections). --force upserts everything,
 * overwriting curation with the YAML — say so before using it.
 *
 * Env (same pair every server-side Supabase caller uses):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import YAML from 'yaml'

interface ManifestEntry {
  file: string
  kind: 'image' | 'video'
  day: number | null
  stop: string | null
  caption?: string
  takenAt?: string
  match: 'auto' | 'manual'
  original?: string
}

const CHUNK = 100 // keep every write small — large upserts have wedged the shared instance

async function main() {
  const args = process.argv.slice(2)
  const getFlag = (name: string) => {
    const idx = args.indexOf(`--${name}`)
    return idx >= 0 ? args[idx + 1] : undefined
  }
  const slug = getFlag('slug')
  const dryRun = args.includes('--dry-run')
  const force = args.includes('--force')
  if (!slug) {
    console.error('usage: pnpm travel:sync-media-db --slug <trip-slug> [--dry-run] [--force]')
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env.')
    process.exit(1)
  }
  const supabase = createClient(url, key)

  const manifestPath = path.join(
    process.cwd(),
    'apps/travel/web/content/stories',
    `${slug}.media.yaml`
  )
  if (!fs.existsSync(manifestPath)) {
    console.error(`No manifest at ${manifestPath}`)
    process.exit(1)
  }
  const parsed = YAML.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    media?: ManifestEntry[]
  } | null
  const entries = parsed?.media ?? []
  if (entries.length === 0) {
    console.log('Manifest has no media rows — nothing to sync.')
    return
  }

  const rows = entries
    .filter((e) => e.file)
    .map((e) => ({
      trip_slug: slug,
      file: e.file,
      kind: e.kind === 'video' ? 'video' : 'image',
      day: e.day ?? null,
      stop: e.stop ?? null,
      caption: e.caption ?? null,
      selected: true,
      sort_order: null,
      taken_at: e.takenAt ?? null,
      match: e.match === 'auto' ? 'auto' : 'manual',
      original: e.original ?? null,
    }))

  if (dryRun) {
    const { count, error } = await supabase
      .from('travel_trip_media')
      .select('file', { count: 'exact', head: true })
      .eq('trip_slug', slug)
    if (error) {
      console.error(`count failed (is migration 074 applied?): ${error.message}`)
      process.exit(1)
    }
    console.log(
      `[dry-run] manifest rows: ${rows.length} · already in DB for ${slug}: ${count ?? 0} · ` +
        `mode: ${force ? 'upsert (would overwrite curation!)' : 'insert-only'}`
    )
    return
  }

  let written = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { data, error } = await supabase
      .from('travel_trip_media')
      .upsert(chunk, { onConflict: 'trip_slug,file', ignoreDuplicates: !force })
      .select('file')
    if (error) {
      console.error(`upsert failed (is migration 074 applied?): ${error.message}`)
      process.exit(1)
    }
    written += (data ?? []).length
    console.log(`  …${Math.min(i + CHUNK, rows.length)}/${rows.length}`)
  }
  console.log(
    `\nDone: ${written} ${force ? 'upserted' : 'inserted'}, ` +
      `${rows.length - written} already present (curation preserved).`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
