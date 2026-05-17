/**
 * One-shot migration: filesystem content/stories/ → Supabase `stories` + `chart_data`.
 *
 * DESTRUCTIVE. The DB is the source of truth — running this script with
 * --force overwrites existing rows from the fs version. Only use against
 * an empty DB (initial seed) or a development DB you can afford to lose.
 *
 * Usage:
 *   npx tsx scripts/migrate-content-to-db.ts                       # default insert-only seed (safe)
 *   npx tsx scripts/migrate-content-to-db.ts --slug foo            # one slug, insert-only
 *   npx tsx scripts/migrate-content-to-db.ts --dry-run             # no writes
 *   npx tsx scripts/migrate-content-to-db.ts --force --i-understand-this-overwrites-db
 *                                                                  # full upsert (will overwrite)
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

import { syncStory, syncAll, listFsSlugs } from '../lib/syncToDb'

type Args = { slug?: string; dryRun: boolean; force: boolean; ack: boolean }

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, force: false, ack: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--slug') args.slug = argv[++i]
    else if (argv[i] === '--dry-run') args.dryRun = true
    else if (argv[i] === '--force') args.force = true
    else if (argv[i] === '--i-understand-this-overwrites-db') args.ack = true
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.force && !args.ack) {
    console.error('Refusing --force without --i-understand-this-overwrites-db. DB is source of truth.')
    process.exit(1)
  }
  const skipIfExists = !args.force
  const slugs = args.slug ? [args.slug] : listFsSlugs()

  console.log(
    `Migrating ${slugs.length} stor${slugs.length === 1 ? 'y' : 'ies'}` +
      `${args.dryRun ? ' (dry run)' : ''} mode=${skipIfExists ? 'insert-only' : 'FORCE-UPSERT'}`
  )

  if (args.dryRun) {
    for (const slug of slugs) console.log(`  ${slug}`)
    console.log('done (dry run — no writes).')
    return
  }

  const opts = { skipIfExists }
  const results = args.slug ? [await syncStory(args.slug, opts)] : await syncAll(opts)
  for (const r of results) {
    if (r.ok && r.skipped) console.log(`  · ${r.slug} (already in DB, untouched)`)
    else if (r.ok) console.log(`  ✓ ${r.slug}  charts=${r.charts}`)
    else { console.error(`  ✗ ${r.slug}: ${r.error}`); process.exitCode = 1 }
  }
  console.log('done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
