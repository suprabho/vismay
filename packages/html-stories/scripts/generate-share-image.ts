/**
 * Render link-preview cards (src/shareImageRender.ts): a screenshot of the
 * page beside its title and description, served as the story's og:image.
 * Run by .github/workflows/render-html-story-og.yml, which publishing
 * dispatches for one story (src/shareImage.ts); by hand:
 *
 *   pnpm --filter @vismay/html-stories generate-share-image <slug> [--force]
 *
 * Backfill every published public story (vizmaya-fyi, footshorts, vizf1,
 * viznba; travel never gets one), skipping those whose card is current:
 *
 *   pnpm --filter @vismay/html-stories generate-share-image --all [--app=<app>] [--force] [--dry-run] [--limit=<n>]
 *
 * --force renders even when nothing changed since the last card; --dry-run
 * lists what would render; --limit stops after that many renders.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and Playwright's
 * Chromium (pnpm exec playwright install chromium).
 */

import { parseHtmlStoryApp } from '../src/apps'
import { isSafeSlug } from '../src/meta'
import { backfillHtmlStoryShareImages, generateHtmlStoryShareImage } from '../src/shareImageRender'

function usage(): never {
  console.error(
    'usage: generate-share-image <slug> [--force]\n' +
      '       generate-share-image --all [--app=<app>] [--force] [--dry-run] [--limit=<n>]',
  )
  process.exit(2)
}

async function main() {
  const args = process.argv.slice(2)
  const flag = (name: string) => args.includes(`--${name}`)
  const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const force = flag('force')
  const dryRun = flag('dry-run')

  if (flag('all')) {
    const appArg = option('app')
    const app = appArg ? parseHtmlStoryApp(appArg) : undefined
    if (appArg && !app) usage()
    const limitArg = option('limit')
    const limit = limitArg ? Number(limitArg) : undefined
    if (limit != null && !(Number.isInteger(limit) && limit > 0)) usage()
    const r = await backfillHtmlStoryShareImages({ app: app ?? undefined, force, dryRun, limit })
    if (r.failed.length) process.exitCode = 1
    return
  }

  const slug = args.find((a) => !a.startsWith('--'))
  if (!slug || !isSafeSlug(slug)) usage()
  try {
    await generateHtmlStoryShareImage({ slug, force, dryRun })
  } catch (e) {
    console.error(`✗ ${slug}: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
