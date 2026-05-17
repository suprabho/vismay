/**
 * Populate display_order for all stories.
 *
 * Usage:
 *   pnpm populate-order                   # Dry run (show plan, don't write)
 *   pnpm populate-order --apply           # Apply changes
 *   pnpm populate-order --apply --by=date # Order by date (default)
 *   pnpm populate-order --apply --by=title
 *   pnpm populate-order --apply --by=slug
 *
 * Reads from the current CONTENT_SOURCE (fs or db). Lists all published +
 * listed stories, sorts them by the chosen criterion, and assigns
 * display_order 0, 1, 2, ... in that order.
 *
 * Stories with an existing display_order are overwritten — use this to
 * normalize ordering or reset after manual edits.
 */

import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

import matter from 'gray-matter'
import { getContentSource } from '../lib/contentSource'

type OrderBy = 'date' | 'title' | 'slug'

function parseArgs() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const byArg = args.find((a) => a.startsWith('--by='))
  const by = (byArg?.split('=')[1] ?? 'date') as OrderBy
  if (!['date', 'title', 'slug'].includes(by)) {
    console.error(`Invalid --by value: ${by}. Use date, title, or slug.`)
    process.exit(1)
  }
  return { apply, by }
}

async function main() {
  const { apply, by } = parseArgs()
  const mode = (process.env.CONTENT_SOURCE ?? 'fs').toLowerCase()
  console.log(`[populate-order] CONTENT_SOURCE=${mode}, orderBy=${by}, apply=${apply}`)

  const src = getContentSource()
  const metas = await src.listStories()

  const listed = metas.filter((m) => m.status === 'published' && m.listed)
  console.log(`[populate-order] Found ${listed.length} published + listed stories`)

  const withMeta = await Promise.all(
    listed.map(async (m) => {
      const md = await src.readMarkdown(m.slug)
      if (!md) return null
      const { data } = matter(md)
      return {
        slug: m.slug,
        title: (data.title as string) ?? m.slug,
        date: (data.date as string) ?? '',
        currentOrder: m.displayOrder,
      }
    })
  )

  const stories = withMeta.filter((s): s is NonNullable<typeof s> => s !== null)

  const sorted = [...stories].sort((a, b) => {
    if (by === 'date') return (b.date ?? '').localeCompare(a.date ?? '')
    if (by === 'title') return a.title.localeCompare(b.title)
    return a.slug.localeCompare(b.slug)
  })

  console.log('\n[populate-order] Planned ordering:')
  console.log('  idx  current  slug                           title')
  console.log('  ---  -------  -----------------------------  -----')
  sorted.forEach((s, i) => {
    const current = s.currentOrder == null ? '—' : String(s.currentOrder)
    const arrow = s.currentOrder === i ? ' ' : '→'
    console.log(
      `  ${String(i).padStart(3)}  ${current.padStart(7)}  ${arrow} ${s.slug.padEnd(30)} ${s.title}`
    )
  })

  if (!apply) {
    console.log('\n[populate-order] Dry run — pass --apply to write changes.')
    return
  }

  console.log('\n[populate-order] Writing changes...')
  let updated = 0
  for (let i = 0; i < sorted.length; i++) {
    const story = sorted[i]
    if (story.currentOrder === i) continue
    await src.updateMetadata(story.slug, { displayOrder: i })
    console.log(`[populate-order] ✓ ${story.slug} → ${i}`)
    updated++
  }
  console.log(`\n[populate-order] Updated ${updated} stories.`)
}

main().catch((err) => {
  console.error('[populate-order]', err)
  process.exit(1)
})
