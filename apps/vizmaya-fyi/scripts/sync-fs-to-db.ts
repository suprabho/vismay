/**
 * Prebuild hook: insert-only seeding from fs to Supabase before `next build`.
 *
 * DB is the source of truth. This script CANNOT and MUST NOT overwrite an
 * existing story or chart row. It only inserts brand-new (slug,) and
 * (slug,chart_id) rows — the no-overwrite guarantee is enforced at the
 * Postgres layer via ignoreDuplicates (ON CONFLICT DO NOTHING) inside
 * lib/syncToDb.ts, not by this script's own logic.
 *
 * Do NOT add an env var that flips this to a force-upsert mode. Editing
 * existing content goes through the admin UI (or `npm run migrate-content`
 * run by hand against a known-empty / development DB only). A previous
 * attempt to add a SYNC_SKIP_EXISTING override caused production data loss.
 *
 * No-ops silently when CONTENT_SOURCE !== 'db' (local dev on fs) or when
 * Supabase credentials are absent so CI builds without a DB connection don't
 * fail hard.
 *
 * Loads env via @next/env so this script sees the same CONTENT_SOURCE,
 * NEXT_PUBLIC_SUPABASE_URL, etc. that the `next build` process will see.
 * Without this, `npx tsx` sees no .env/.env.local and defaults to fs mode,
 * which would skip the sync even when the build itself is reading from DB.
 */

import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

import { syncAll } from '../lib/syncToDb'

async function main() {
  const mode = (process.env.CONTENT_SOURCE ?? 'fs').toLowerCase()
  if (mode !== 'db') {
    console.log('[sync] CONTENT_SOURCE=fs — skipping DB sync')
    return
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[sync] Supabase credentials missing — skipping DB sync')
    return
  }

  const results = await syncAll({ skipIfExists: true })
  let failed = 0
  for (const r of results) {
    if (!r.ok) { console.error(`[sync] ✗ ${r.slug}: ${r.error}`); failed++ }
    else if (r.skipped) console.log(`[sync] · ${r.slug} (already in DB, skipped)`)
    else console.log(`[sync] ✓ ${r.slug} (seeded)`)
  }
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('[sync]', err)
  process.exit(1)
})
