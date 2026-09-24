/**
 * AI Data Centers daily snapshot — publish (freeze) the draft edition.
 *
 * Sets status = 'published', assigns the sequential edition number and the
 * publish time, then asks vizmaya.fyi to re-render /ai-daily/doom-v-boom
 * and /ai-daily/doom-v-boom/[date]. A published row is never updated again
 * (a DB trigger enforces it); corrections run in the next edition.
 *
 * The draft goes public at 09:00 UTC whether or not an editor has looked at
 * it — review is a window, not a gate. An editor's Hold moves
 * auto_publish_at by 30 minutes, once, which is why the cron also runs at
 * 09:30. `--force` publishes regardless of a hold (the admin's "Publish now").
 *
 * Run locally:  pnpm ai-data-centers:publish-edition
 *               pnpm ai-data-centers:publish-edition -- --force
 * Run in CI:    .github/workflows/publish-dc-edition.yml (09:00 + 09:30 UTC)
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — write dc_editions
 *   ADMIN_SESSION_SECRET                                — signs the revalidate ping (optional)
 *   EDITIONS_SITE_URL                                   — public site (default https://vizmaya.fyi)
 */

import { config as loadEnv } from 'dotenv'
import { publishDraftEdition } from '@vismay/content-source/dcEditions'
import { pingEditionRevalidate } from './revalidate'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

function parseArgs(argv: string[]): { force: boolean } {
  const out = { force: false }
  for (const a of argv) {
    if (a === '--') continue
    if (a === '--force') out.force = true
    else throw new Error(`Unknown flag: ${a}`)
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const res = await publishDraftEdition({ onlyIfDue: !args.force })
  if (!res.published) {
    console.log(`[publish] nothing published: ${res.reason}`)
    return
  }
  const e = res.edition!
  console.log(
    `[publish] edition ${e.number} · ${e.date} · "${e.headline}" · ${e.counts.stories} stories · ${e.counts.papers} papers · mood ${e.moodScore ?? '—'}`,
  )
  await pingEditionRevalidate(e.date)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
