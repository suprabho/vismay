/**
 * Read today's trends from Xpoz and keep them in randomizer_trends (see
 * src/trendsServer.ts). Run daily by .github/workflows/randomizer-trends.yml.
 *
 *   XPOZ_API_KEY=… NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     pnpm --filter @vismay/randomizer trends:refresh
 *
 * --dry-run reads Xpoz and prints the snapshot without writing it (no
 * Supabase credentials needed).
 */

import { collectTrends, refreshTrends } from '../src/trendsServer'
import type { TrendSnapshot } from '../src/trends'

function report(s: Omit<TrendSnapshot, 'refreshedBy'>): void {
  console.log(`trends ${s.day} · ${s.status} · ${s.searches} searches`)
  for (const b of s.beats) {
    console.log(`  ${b.label}: ${b.items.length} posts${b.errors.length ? `, ${b.errors.length} failed` : ''}`)
    for (const e of b.errors) console.log(`    ! ${e}`)
    for (const i of b.items.slice(0, 3)) console.log(`    - ${i.where} (${i.score}): ${i.title.slice(0, 100)}`)
  }
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry-run')
  const snapshot = dry ? await collectTrends() : await refreshTrends(process.env.GITHUB_ACTIONS ? 'job:github-actions' : 'job:cli')
  report(snapshot)
  if (dry) console.log('dry run: nothing written')
  if (snapshot.status === 'partial') console.warn('some searches failed; the snapshot was saved without them')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
