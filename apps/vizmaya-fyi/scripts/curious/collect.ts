/**
 * Curious Desk, stage 1: discover candidate documents from one source and
 * keep them in curious_documents with their provenance.
 *
 * Usage:
 *   pnpm curious:collect -- --source gdelt --query '"for the first time in history"' --since 2026-10-01 --limit 500
 *   pnpm curious:collect -- --source loc --collection chronicling-america --query '"strange incident"' --since 1900-01-01 --until 1925-12-31 --limit 200 --full-text
 *   pnpm curious:collect -- --source loc --limit 50 --dry-run         # rotates queries.json by day of year, prints 5 rows, writes nothing
 *
 * Flags: --source gdelt|loc|europeana|gallica (required), --query, --query-file (default scripts/curious/queries.json),
 *        --since YYYY-MM-DD, --until YYYY-MM-DD, --limit N (default 200), --collection, --full-text, --dry-run
 *
 * Env (apps/vizmaya-fyi/.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; EUROPEANA_API_KEY for europeana.
 * Budget: a 25-minute soft deadline under the workflow's 30-minute kill; what is not collected is picked up next run.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { collectorFor } from '@vismay/curious-pipeline/collectors'
import { upsertDocuments } from '@vismay/curious-pipeline/store'
import { COLLECTOR_IDS, curiousEnv, type CollectorId, type DocumentUpsert } from '@vismay/curious-pipeline/types'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const DEADLINE_MS = Number(process.env.DEADLINE_MINUTES ?? 25) * 60_000
const UPSERT_EVERY = 200

interface Args {
  source: CollectorId
  query: string | null
  queryFile: string
  since?: string
  until?: string
  limit: number
  collection?: string
  fullText: boolean
  dryRun: boolean
}

function parseArgs(argv: string[]): Args {
  const a: Args = { source: 'gdelt', query: null, queryFile: 'scripts/curious/queries.json', limit: 200, fullText: false, dryRun: false }
  let sourceSet = false
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    const v = argv[i + 1]
    if (k === '--') continue
    if (k === '--source') {
      if (!COLLECTOR_IDS.includes(v as CollectorId)) throw new Error(`--source must be one of ${COLLECTOR_IDS.join(', ')}`)
      a.source = v as CollectorId
      sourceSet = true
      i++
    } else if (k === '--query') (a.query = v), i++
    else if (k === '--query-file') (a.queryFile = v), i++
    else if (k === '--since') (a.since = v), i++
    else if (k === '--until') (a.until = v), i++
    else if (k === '--limit') (a.limit = Number(v)), i++
    else if (k === '--collection') (a.collection = v), i++
    else if (k === '--full-text') a.fullText = true
    else if (k === '--dry-run') a.dryRun = true
    else throw new Error(`Unknown flag ${k}`)
  }
  if (!sourceSet) throw new Error('--source is required')
  for (const d of [a.since, a.until]) if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`Dates are YYYY-MM-DD, got ${d}`)
  if (!Number.isFinite(a.limit) || a.limit < 1) throw new Error('--limit must be a positive number')
  return a
}

function pickQuery(file: string, source: CollectorId, now: Date): string {
  const parsed = JSON.parse(readFileSync(resolve(file), 'utf8')) as { queries: Array<{ query: string; sources: string[] }> }
  const mine = parsed.queries.filter((q) => q.sources.includes(source))
  if (!mine.length) throw new Error(`${file} has no query for ${source}`)
  const day = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86_400_000)
  return mine[day % mine.length].query
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const now = new Date()
  const query = args.query ?? pickQuery(args.queryFile, args.source, now)
  const started = Date.now()
  const stop = () => Date.now() - started > DEADLINE_MS
  console.log(`Curious collect: ${args.source} · ${query}${args.collection ? ` · ${args.collection}` : ''}${args.since ? ` · since ${args.since}` : ''}${args.until ? ` · until ${args.until}` : ''} · limit ${args.limit}${args.dryRun ? ' · DRY RUN' : ''}`)

  const collector = collectorFor(args.source)
  const buffer: DocumentUpsert[] = []
  let collected = 0
  let written = 0
  let skipped = 0
  const errors: string[] = []

  const flush = async () => {
    if (!buffer.length || args.dryRun) return
    const s = await upsertDocuments(buffer.splice(0), { batch: UPSERT_EVERY, log: (l) => console.log(l) })
    written += s.written
    skipped += s.skipped
    errors.push(...s.errors)
  }

  try {
    for await (const doc of collector.collect({
      query,
      since: args.since,
      until: args.until,
      limit: args.limit,
      collection: args.collection,
      fullText: args.fullText,
      env: curiousEnv(),
      now,
      log: (l) => console.log(l),
      stop,
    })) {
      collected++
      if (args.dryRun) {
        if (collected <= 5) console.log(JSON.stringify({ ...doc, text: doc.text ? `${doc.text.slice(0, 160)}… (${doc.text.length} chars)` : null }, null, 2))
        continue
      }
      buffer.push(doc)
      if (buffer.length >= UPSERT_EVERY) await flush()
      if (stop()) {
        console.warn(`  · soft deadline reached after ${collected} documents; the rest waits for the next run`)
        break
      }
    }
  } finally {
    await flush()
  }

  if (args.dryRun) console.log(`Done (dry run). ${collected} documents would be written.`)
  else console.log(`Done. ${collected} collected, ${written} written, ${skipped} skipped (url already held by another source row)${errors.length ? `, ${errors.length} errors` : ''}.`)
  if (errors.length) {
    for (const e of errors.slice(0, 10)) console.error(`  ✗ ${e}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
