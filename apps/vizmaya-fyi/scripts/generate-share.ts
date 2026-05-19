/**
 * Render share PNGs for a demo or a social post from the CLI.
 *
 * Thin wrapper around `lib/storyShareRender.ts`. Used by the
 * render-share.yml dispatch workflow; can also be invoked locally:
 *
 *   npx tsx scripts/generate-share.ts demo <demoId>
 *   npx tsx scripts/generate-share.ts post <postId>
 *
 * For back-compat, a bare numeric arg (no mode) is treated as `demo <id>`.
 */

import fs from 'fs'
import path from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  renderShareAssets,
  type ShareRatio,
  SHARE_RATIOS,
} from '@vismay/content-source/storyShareRender'
import { computeContentRevisionHash } from '@vismay/content-source/storyPdf'
import { getContentSource } from '@vismay/content-source/contentSource'
import type { AssetRef, ShareCardRatio } from '@vismay/content-source/socialPostPlans'
import { auth } from '../lib/adminAuth'

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

type Mode = 'demo' | 'post'

function parseArgs(argv: string[]): { mode: Mode; id: string } | null {
  if (argv.length === 0) return null
  if (argv.length === 1) {
    // Back-compat: bare numeric arg → demo.
    return { mode: 'demo', id: argv[0]! }
  }
  const mode = argv[0]
  if (mode !== 'demo' && mode !== 'post') return null
  if (!argv[1]) return null
  return { mode, id: argv[1] }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  if (!parsed) {
    console.error('Usage: npx tsx scripts/generate-share.ts <demo|post> <id>')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!) as unknown as SupabaseClient
  const baseUrl =
    process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`

  if (parsed.mode === 'demo') {
    await runForDemo(supabase, baseUrl, parsed.id)
  } else {
    await runForPost(supabase, baseUrl, parsed.id)
  }
}

async function runForDemo(
  supabase: SupabaseClient,
  baseUrl: string,
  idArg: string
) {
  const demoId = Number(idArg)
  if (!Number.isInteger(demoId) || demoId <= 0) {
    console.error(`Bad demoId "${idArg}"`)
    process.exit(1)
  }

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
  const contentRevisionHash = await computeContentRevisionHash(source, demo.story_slug as string)

  const result = await renderShareAssets({
    supabase,
    auth,
    demoId,
    storySlug: demo.story_slug as string,
    baseUrl,
    cardIds,
    contentRevisionHash,
    log: (m) => console.log(`  ${m}`),
  })

  reportResult(result)
}

async function runForPost(
  supabase: SupabaseClient,
  baseUrl: string,
  idArg: string
) {
  const postId = idArg
  if (!postId) {
    console.error(`Bad postId "${idArg}"`)
    process.exit(1)
  }

  const { data: post, error } = await supabase
    .from('social_post_plans')
    .select('id, story_slug, asset_ref')
    .eq('id', postId)
    .single()
  if (error || !post) {
    console.error('Post not found:', error?.message)
    process.exit(1)
  }
  if (!post.story_slug) {
    console.error('Post has no story_slug.')
    process.exit(1)
  }

  const ref = post.asset_ref as AssetRef
  let cardIds: string[]
  let ratio: ShareCardRatio
  if (ref.kind === 'share_card') {
    cardIds = [ref.cardId]
    ratio = ref.ratio
  } else if (ref.kind === 'share_card_carousel') {
    cardIds = ref.cardIds
    ratio = ref.ratio
  } else {
    console.error(`Post asset_ref.kind=${ref.kind} is not renderable as share assets.`)
    process.exit(1)
  }

  if (!SHARE_RATIOS.includes(ratio as ShareRatio)) {
    console.error(`Bad ratio "${ratio}"`)
    process.exit(1)
  }

  console.log(`\n━━━ post ${postId} · story ${post.story_slug} · ${cardIds.length} card(s) @ ${ratio} ━━━`)
  console.log(`  baseUrl: ${baseUrl}`)

  const source = getContentSource()
  const contentRevisionHash = await computeContentRevisionHash(source, post.story_slug as string)

  const result = await renderShareAssets({
    supabase,
    auth,
    demoId: null,
    storySlug: post.story_slug as string,
    baseUrl,
    cardIds,
    ratios: [ratio as ShareRatio],
    contentRevisionHash,
    log: (m) => console.log(`  ${m}`),
  })

  reportResult(result)
}

function reportResult(result: { rendered: number; skipped: number; errors: { target: { cardId: string; ratio: string }; message: string }[] }) {
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
