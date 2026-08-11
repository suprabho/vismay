/**
 * Seed/sync a travel story's hand-authored files (`<slug>.md` +
 * `<slug>.config.yaml`) into the shared `stories` table with
 * `app_slug='travel'` — the row the admin compose/canvas surfaces edit and
 * the travel app reads once `CONTENT_SOURCE=db`.
 *
 *   pnpm travel:sync-story-db --slug new-york-2026 [--dry-run] [--force]
 *
 * Insert-only by default: an existing row is left untouched so a re-run
 * never clobbers admin canvas edits. --force overwrites the DB row with the
 * git files — say so before using it. (Mirrors
 * apps/vizmaya-fyi/lib/syncToDb.ts; travel stories have no charts or share
 * sidecars, and stay draft/unlisted — the trip password gate is the access
 * boundary.)
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import YAML from 'yaml'

/** Minimal frontmatter parse (gray-matter isn't a root dep; yaml is). */
function parseFrontmatter(markdown: string): Record<string, unknown> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)
  if (!m) return {}
  try {
    return (YAML.parse(m[1]) as Record<string, unknown>) ?? {}
  } catch {
    return {}
  }
}

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
    console.error('usage: pnpm travel:sync-story-db --slug <story-slug> [--dry-run] [--force]')
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env.')
    process.exit(1)
  }
  const supabase = createClient(url, key)

  const storiesDir = path.join(process.cwd(), 'apps/travel/web/content/stories')
  const mdPath = path.join(storiesDir, `${slug}.md`)
  if (!fs.existsSync(mdPath)) {
    console.error(`No story markdown at ${mdPath}`)
    process.exit(1)
  }
  const markdown = fs.readFileSync(mdPath, 'utf8')
  const configPath = path.join(storiesDir, `${slug}.config.yaml`)
  const configYaml = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : null

  const fm = parseFrontmatter(markdown) as {
    title?: string
    vertical?: string
    status?: string
    listed?: boolean
  }
  if (fm.vertical !== 'travel') {
    console.error(`${slug} frontmatter vertical is "${fm.vertical}", expected "travel".`)
    process.exit(1)
  }

  const row = {
    slug,
    title: fm.title ?? slug,
    // Trip stories stay draft/unlisted forever — the password gate is the
    // real access boundary (see apps/travel/web/CLAUDE.md).
    status: (fm.status ?? 'draft') as string,
    listed: fm.listed === true,
    markdown,
    config_yaml: configYaml,
    app_slug: 'travel',
    updated_at: new Date().toISOString(),
  }

  if (dryRun) {
    const { data, error } = await supabase
      .from('stories')
      .select('slug, updated_at')
      .eq('slug', slug)
      .maybeSingle()
    if (error) {
      console.error(`stories lookup failed: ${error.message}`)
      process.exit(1)
    }
    console.log(
      `[dry-run] ${slug}: md ${markdown.length}B, config ${configYaml?.length ?? 0}B · ` +
        (data
          ? `row exists (updated ${data.updated_at}) — ${force ? 'WOULD OVERWRITE' : 'would skip'}`
          : 'would insert')
    )
    return
  }

  const { data, error } = await supabase
    .from('stories')
    .upsert(row, { onConflict: 'slug', ignoreDuplicates: !force })
    .select('slug')
  if (error) {
    console.error(`stories upsert failed: ${error.message}`)
    process.exit(1)
  }
  const written = (data ?? []).length > 0
  console.log(
    written
      ? `Done: ${slug} ${force ? 'overwritten' : 'inserted'} (app_slug=travel).`
      : `Skipped: ${slug} already in the DB (canvas edits preserved — use --force to overwrite).`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
