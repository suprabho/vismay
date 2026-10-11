/**
 * Seed/sync a travel HTML story's git copy
 * (`apps/travel/web/content/html-stories/<slug>.html`) into the shared
 * `html_stories` table with `app_slug='travel'`: the row admin's
 * /travel/html-stories edits and agents re-post to, and the one the travel
 * app's /s/<slug> reads first (the git copy is its fallback).
 *
 *   pnpm travel:sync-html-story --slug new-york-2026-day-3 [--dry-run] [--force]
 *
 * Insert-only by default: an existing row is left untouched so a re-run never
 * clobbers an agent's re-post or an admin edit. A new row goes in published,
 * since the git copy it replaces is already served (to the trip's password
 * holders only). --force replaces the row's HTML with the git copy, keeping
 * its status (older versions stay restorable in admin) — say so before
 * using it.
 *
 * The page is linted the way the publish API lints it: it must name its trip
 * (<meta name="travel:trip">) and the slug must start with the trip's.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'node:fs'
import path from 'node:path'
import { getHtmlStoryApp, getHtmlStoryForAdmin, saveHtmlStory } from '../../packages/html-stories/src/htmlStories'
import { extractTripMeta, isSafeSlug, lintHtml } from '../../packages/html-stories/src/meta'

async function main() {
  const args = process.argv.slice(2)
  const getFlag = (name: string) => {
    const idx = args.indexOf(`--${name}`)
    return idx >= 0 ? args[idx + 1] : undefined
  }
  const slug = getFlag('slug')
  const dryRun = args.includes('--dry-run')
  const force = args.includes('--force')
  if (!slug || !isSafeSlug(slug)) {
    console.error('usage: pnpm travel:sync-html-story --slug <story-slug> [--dry-run] [--force]')
    process.exit(1)
  }

  const file = path.join(process.cwd(), 'apps/travel/web/content/html-stories', `${slug}.html`)
  if (!fs.existsSync(file)) {
    console.error(`No HTML story at ${file}`)
    process.exit(1)
  }
  const html = fs.readFileSync(file, 'utf8')
  const lint = lintHtml(html, { app: 'travel', slug })
  if (lint.errors.length) {
    console.error(`${slug}: ${lint.errors.join(' ')}`)
    process.exit(1)
  }
  for (const w of lint.warnings) console.warn(`warning: ${w}`)

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env.')
    process.exit(1)
  }

  const owner = await getHtmlStoryApp(slug)
  if (owner && owner !== 'travel') {
    console.error(`${slug} is already a ${owner} HTML story; pick another slug.`)
    process.exit(1)
  }
  const existing = owner ? await getHtmlStoryForAdmin(slug, 'travel') : null
  const trip = extractTripMeta(html)
  const summary = `${slug} (trip ${trip}): ${(html.length / 1024).toFixed(0)} KB`

  if (dryRun) {
    console.log(
      `[dry-run] ${summary} · ` +
        (existing
          ? `row exists (${existing.status}, updated ${existing.updatedAt}) — ${force ? 'WOULD OVERWRITE its HTML' : 'would skip'}`
          : 'would insert, published'),
    )
    return
  }
  if (existing && !force) {
    console.log(`Skipped: ${slug} already in html_stories (${existing.status}) — use --force to replace its HTML.`)
    return
  }

  const { story, created } = await saveHtmlStory({
    slug,
    app: 'travel',
    html,
    // A new row is published like the git copy it replaces; an existing one keeps its status.
    status: existing ? undefined : 'published',
    source: 'git:travel',
  })
  console.log(`Done: ${slug} ${created ? 'inserted' : 'overwritten'} (${story.status}, app_slug=travel). ${summary}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
