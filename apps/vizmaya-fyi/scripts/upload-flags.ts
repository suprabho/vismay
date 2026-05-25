/**
 * Fetch every country flag from `lipis/flag-icons` and upload it to the
 * Supabase `story-assets` bucket under `flag/<code>.svg`, so flags can be
 * referenced from story YAML as `assets://flag/<code>.svg` — e.g. as map-pin
 * images (the square 1x1 variant crops cleanly inside the circular pin marker).
 *
 * Source: https://github.com/lipis/flag-icons (MIT licensed). Codes are ISO
 * 3166-1 alpha-2 lowercase (`us`, `in`, `gb`) plus the set's non-ISO extras
 * (`eu`, `un`, `gb-eng`, …) — every entry in the upstream manifest is uploaded.
 *
 * Idempotent: uploads with `upsert: true`, so re-running refreshes existing
 * flags rather than erroring.
 *
 * Run:
 *   pnpm --filter vizmaya-fyi flags:upload            # fetch + upload
 *   pnpm --filter vizmaya-fyi flags:upload --dry-run  # fetch + report only
 *
 * Requires `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in the
 * environment (loaded from `.env` / `.env.local` via @next/env).
 */

import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

import { createClient } from '@supabase/supabase-js'

const BUCKET = 'story-assets'
const PREFIX = 'flag'
// Pin the upstream ref here if you ever need byte-for-byte reproducibility.
const FLAG_ICONS_REF = 'main'
const BASE = `https://raw.githubusercontent.com/lipis/flag-icons/${FLAG_ICONS_REF}`
const CONCURRENCY = 8

interface Country {
  code: string
  name: string
  iso: boolean
  flag_1x1: string
  flag_4x3: string
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.text()
}

/** Run `worker` over `items` with a bounded number of concurrent tasks. */
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]
      await worker(item)
    }
  })
  await Promise.all(runners)
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!dryRun && (!url || !serviceKey)) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
    process.exit(1)
  }
  const supabase = url && serviceKey ? createClient(url, serviceKey) : null

  console.log(`Fetching flag-icons manifest (${FLAG_ICONS_REF})…`)
  const manifest = JSON.parse(await fetchText(`${BASE}/country.json`)) as Country[]
  console.log(`Manifest: ${manifest.length} flags. Mode: ${dryRun ? 'dry-run' : 'upload'} → ${BUCKET}/${PREFIX}/`)

  let done = 0
  const failures: { code: string; reason: string }[] = []

  await pool(manifest, CONCURRENCY, async (country) => {
    const dest = `${PREFIX}/${country.code}.svg`
    try {
      const svg = await fetchText(`${BASE}/${country.flag_1x1}`)
      if (!dryRun && supabase) {
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(dest, Buffer.from(svg), { contentType: 'image/svg+xml', upsert: true })
        if (error) throw new Error(error.message)
      }
      done++
      if (done % 25 === 0) console.log(`  …${done}/${manifest.length}`)
    } catch (err) {
      failures.push({ code: country.code, reason: err instanceof Error ? err.message : String(err) })
    }
  })

  console.log(`\nDone: ${done}/${manifest.length} ${dryRun ? 'fetched' : 'uploaded'}.`)
  if (failures.length > 0) {
    console.error(`Failed: ${failures.length}`)
    for (const f of failures) console.error(`  ${f.code}: ${f.reason}`)
    process.exit(1)
  }
  if (!dryRun) console.log(`Reference them as e.g. assets://${PREFIX}/us.svg`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
