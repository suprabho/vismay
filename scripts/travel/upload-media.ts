/**
 * Upload a trip's staged media to the `story-assets` Supabase bucket.
 *
 *   pnpm travel:upload-media --slug new-york-2026 [--force]
 *
 * Uploads everything in vizmaya-data/travel-media/<slug>/staged/ to bucket
 * keys `<slug>/<filename>` (the `assets://<slug>/<filename>` refs the story
 * config and media manifest use). Idempotent: existing objects are skipped
 * unless --force (which upserts).
 *
 * Env (same pair every server-side Supabase caller uses):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'story-assets'

function contentTypeFor(file: string): string {
  const ext = path.extname(file).toLowerCase()
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.avif':
      return 'image/avif'
    case '.gif':
      return 'image/gif'
    case '.mp4':
      return 'video/mp4'
    default:
      return 'application/octet-stream'
  }
}

async function main() {
  const args = process.argv.slice(2)
  const getFlag = (name: string) => {
    const idx = args.indexOf(`--${name}`)
    return idx >= 0 ? args[idx + 1] : undefined
  }
  const slug = getFlag('slug')
  const force = args.includes('--force')
  if (!slug) {
    console.error('usage: pnpm travel:upload-media --slug <trip-slug> [--force]')
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env.')
    process.exit(1)
  }
  const supabase = createClient(url, key)

  const stagedDir = path.join(process.cwd(), 'vizmaya-data/travel-media', slug, 'staged')
  if (!fs.existsSync(stagedDir)) {
    console.error(`Nothing staged at ${stagedDir} — run pnpm travel:prepare-media first.`)
    process.exit(1)
  }
  const files = fs.readdirSync(stagedDir).filter((f) => !f.startsWith('.'))
  if (files.length === 0) {
    console.log('Staged folder is empty — nothing to upload.')
    return
  }

  // Existing objects under the slug prefix → skip already-uploaded files.
  const uploaded = new Set<string>()
  if (!force) {
    let offset = 0
    for (;;) {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(slug, { limit: 100, offset })
      if (error) {
        console.error(`list failed: ${error.message}`)
        process.exit(1)
      }
      for (const o of data ?? []) uploaded.add(o.name)
      if (!data || data.length < 100) break
      offset += 100
    }
  }

  let sent = 0
  let skipped = 0
  for (const file of files) {
    if (!force && uploaded.has(file)) {
      skipped += 1
      continue
    }
    const body = fs.readFileSync(path.join(stagedDir, file))
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(`${slug}/${file}`, body, {
        contentType: contentTypeFor(file),
        upsert: true,
      })
    if (error) {
      console.error(`✗ ${file}: ${error.message}`)
      process.exitCode = 1
      continue
    }
    sent += 1
    console.log(`✓ uploaded ${slug}/${file}`)
  }
  console.log(
    `\nDone: ${sent} uploaded, ${skipped} already present. Refs look like assets://${slug}/<file>.`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
