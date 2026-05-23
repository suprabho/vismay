/**
 * One-off: clear out vizf1 race/session data for a clean re-ingest.
 *
 * Order matters:
 *   1. vizf1_races          — cascades to vizf1_sessions and vizf1_session_results
 *   2. vizf1_drivers        — independent (constructor_id FK is a no-op pre-002 migration)
 *   3. vizf1_constructors   — last; if 002_drivers_constructor_fk.sql has been
 *                             applied, drivers must already be gone.
 *
 * vizf1_circuits is intentionally left alone — track_path_svg geometry is
 * derived from OpenF1 location samples and re-deriving it is expensive.
 * ingestSessions will upsert circuit rows it sees, so old ones simply remain.
 *
 * Run via: pnpm --filter @vizf1/worker tsx --env-file=.env src/truncateRaceData.ts
 */

import { getSupabase } from './supabase'

async function deleteAll(table: string) {
  const sb = getSupabase()
  // PostgREST refuses DELETE without a filter; `not.is.null` on a column
  // that's NOT NULL in the schema matches every row.
  const filterCol = table === 'vizf1_races' ? 'id' : table === 'vizf1_drivers' ? 'driver_id' : 'constructor_id'
  const { error, count } = await sb
    .from(table)
    .delete({ count: 'exact' })
    .not(filterCol, 'is', null)
  if (error) throw new Error(`delete ${table}: ${error.message}`)
  console.log(`  ${table}: deleted ${count ?? '?'} rows`)
}

async function main() {
  console.log('[truncate] starting…')
  // Cascades to vizf1_sessions and vizf1_session_results.
  await deleteAll('vizf1_races')
  await deleteAll('vizf1_drivers')
  await deleteAll('vizf1_constructors')
  console.log('[truncate] done.')
}

main().catch((e) => {
  console.error('[truncate] fatal:', e)
  process.exit(1)
})
