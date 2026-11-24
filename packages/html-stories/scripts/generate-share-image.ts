/**
 * Render a story's link-preview card (src/shareImageRender.ts): a screenshot
 * of the page beside its title and description, served as its og:image.
 * Run by .github/workflows/render-html-story-og.yml, which publishing
 * dispatches (src/shareImage.ts); by hand:
 *
 *   pnpm --filter @vismay/html-stories generate-share-image <slug> [--force]
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and Playwright's
 * Chromium (pnpm exec playwright install chromium). --force renders it even
 * when nothing changed since the last card.
 */

import { isSafeSlug } from '../src/meta'
import { generateHtmlStoryShareImage } from '../src/shareImageRender'

async function main() {
  const args = process.argv.slice(2)
  const slug = args.find((a) => !a.startsWith('--'))
  const force = args.includes('--force')
  if (!slug || !isSafeSlug(slug)) {
    console.error('usage: generate-share-image <slug> [--force]')
    process.exit(2)
  }
  try {
    await generateHtmlStoryShareImage({ slug, force })
  } catch (e) {
    console.error(`✗ ${slug}: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }
}

main()
