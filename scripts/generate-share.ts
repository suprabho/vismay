/**
 * Render the curated share PNGs for a demo from the CLI.
 *
 * Thin wrapper around `lib/storyShareRender.ts`. Used by the
 * render-share.yml dispatch workflow; can also be invoked locally:
 *
 *   npx tsx scripts/generate-share.ts <demoId>
 *
 * Loads demo row + content_revision_hash, then drives Playwright through
 * each (cardId × ratio) combination.
 */

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { renderShareAssets } from '../lib/storyShareRender'
import { computeContentRevisionHash } from '../lib/storyPdf'
import { getContentSource } from '../lib/contentSource'

const envPath = path.resolve(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
  process.exit(1)
}

async function main() {
  const args = process.argv.slice(2)
  const idArg = args[0]
  if (!idArg) {
    console.error('Usage: npx tsx scripts/generate-share.ts <demoId>')
    process.exit(1)
  }
  const demoId = Number(idArg)
  if (!Number.isInteger(demoId) || demoId <= 0) {
    console.error(`Bad demoId "${idArg}"`)
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!)
  const baseUrl =
    process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`

  const { data: demo, error } = await supabase
    .from('demos')
    .select('id, story_slug, share_card_ids')
    .eq('id', demoId)
    .single()
  if (error || !demo) {
    console.error('Demo not found:', error?.message)
    process.exit(1)
  }

  const cardIds: string[] = Array.isArray(demo.share_card_ids)
    ? (demo.share_card_ids as Array<{ parentIndex?: number; subIndex?: number; sliceIndex?: number; variant?: string }>)
        .map((c) => {
          if (!c || typeof c !== 'object') return null
          if (typeof c.parentIndex !== 'number' || typeof c.subIndex !== 'number' || typeof c.variant !== 'string') return null
          const slice = typeof c.sliceIndex === 'number' ? c.sliceIndex : 0
          return `${c.parentIndex}-${c.subIndex}-${slice}-${c.variant}`
        })
        .filter((s): s is string => !!s)
    : []

  if (cardIds.length === 0) {
    console.error('No cards curated for this demo.')
    process.exit(1)
  }

  console.log(`\n━━━ demo ${demoId} · story ${demo.story_slug} · ${cardIds.length} card(s) ━━━`)
  console.log(`  baseUrl: ${baseUrl}`)

  const source = getContentSource()
  const contentRevisionHash = await computeContentRevisionHash(source, demo.story_slug)

  const result = await renderShareAssets({
    supabase,
    demoId,
    storySlug: demo.story_slug,
    baseUrl,
    cardIds,
    contentRevisionHash,
    log: (m) => console.log(`  ${m}`),
  })

  console.log(
    `\nRendered ${result.rendered}, skipped ${result.skipped}${
      result.errors.length > 0 ? `, errors: ${result.errors.length}` : ''
    }.`
  )
  if (result.errors.length > 0) {
    for (const e of result.errors) {
      console.log(`  ✗ ${e.target.cardId} @ ${e.target.ratio}: ${e.message}`)
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
