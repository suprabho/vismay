/**
 * VizF1 ingester — mirror of apps/footshort/worker's ingest.ts.
 *
 * Scheduled job that pulls race results / lap times / telemetry into Postgres.
 * Pure placeholder for now; gets wired with the Ergast / OpenF1 source(s) when
 * the first F1 story needs real data.
 */

import type { RaceMeta } from '@vizf1/shared'

async function main() {
  const races: RaceMeta[] = []
  console.log(`[vizf1:ingest] placeholder — ingested ${races.length} races`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
