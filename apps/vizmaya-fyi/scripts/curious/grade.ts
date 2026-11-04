/**
 * Curious Desk, stage 3: grade candidate claims from explicit features.
 *
 * Usage:
 *   pnpm curious:grade                      # grades every 'candidate' claim → 'graded'
 *   pnpm curious:grade -- --queue           # … and puts them straight into the review queue ('in_review')
 *   pnpm curious:grade -- --regrade         # re-grades every live claim (after a weight or rule change); statuses stay
 *   pnpm curious:grade -- --archive 100     # also looks up Wayback snapshots for up to 100 news documents without one
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { config as loadEnv } from 'dotenv'
import { gradeClaims } from '@vismay/curious-pipeline/gradeRun'
import { listClaims } from '@vismay/curious-pipeline/store'
import { waybackSnapshot } from '@vismay/curious-pipeline/archive'
import { createLimiter } from '@vismay/curious-pipeline/http'
import { createServiceClient } from '@vismay/content-source/supabase'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

function parseArgs(argv: string[]) {
  const a = { queue: false, regrade: false, archive: 0, limit: 2000 }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (k === '--') continue
    if (k === '--queue') a.queue = true
    else if (k === '--regrade') a.regrade = true
    else if (k === '--archive') (a.archive = Number(argv[++i])), void 0
    else if (k === '--limit') (a.limit = Number(argv[++i])), void 0
    else throw new Error(`Unknown flag ${k}`)
  }
  return a
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const sb = createServiceClient()
  const { claims } = await listClaims({ sb, status: args.regrade ? ['candidate', 'graded', 'in_review', 'approved', 'sent_back'] : 'candidate', limit: args.limit })
  console.log(`Curious grade: ${claims.length} claims${args.regrade ? ' (re-grade)' : ''}${args.queue ? ' → review queue' : ''}`)
  const graded = await gradeClaims(claims, { sb, status: args.queue ? 'in_review' : 'graded', log: (l) => console.log(l) })
  const tally: Record<string, number> = {}
  for (const g of graded) tally[g.grade] = (tally[g.grade] ?? 0) + 1
  console.log(`Graded ${graded.length}: ${Object.entries(tally).sort().map(([g, n]) => `${g} ${n}`).join(', ') || 'none'}`)

  if (args.archive > 0) {
    const { data, error } = await sb.from('curious_documents').select('id, canonical_url').eq('source_id', 'gdelt').is('archive_url', null).eq('status', 'detected').order('retrieved_at', { ascending: false }).limit(args.archive)
    if (error) throw new Error(error.message)
    const limiter = createLimiter({ minGapMs: 1500 })
    let found = 0
    for (const d of (data ?? []) as Array<{ id: string; canonical_url: string }>) {
      try {
        const snap = await waybackSnapshot(d.canonical_url, { limiter })
        if (snap) {
          await sb.from('curious_documents').update({ archive_url: snap }).eq('id', d.id)
          found++
        }
      } catch (e) {
        console.warn(`  · wayback ${d.canonical_url}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    console.log(`Archive links: ${found} of ${data?.length ?? 0} documents have a Wayback snapshot`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
