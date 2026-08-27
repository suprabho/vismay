/**
 * One-off backfill: set fixtures.phase on rows inserted since migration
 * 20260521000000_competition_phases ran (the fixtures sync didn't write phase
 * until 2026-08; every row inserted after the migration's backfill — e.g. the
 * whole 26-27 season — carries phase=null and blanked the For You feed cards).
 *
 * Mirrors the migration's CASE exactly. Idempotent — only touches
 * phase-is-null rows, safe to re-run.
 *
 * Usage: tsx --env-file=.env src/backfillFixturePhase.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// Same allowlist as fixtures.ts derivePhase / footshorts-viz KNOCKOUT_STAGES.
const KNOCKOUT_STAGES = [
  'PRELIMINARY_ROUND',
  'FIRST_QUALIFYING_ROUND',
  'SECOND_QUALIFYING_ROUND',
  'THIRD_QUALIFYING_ROUND',
  'PLAY_OFFS',
  'PLAY_OFF_ROUND',
  'PLAYOFFS',
  'LAST_64',
  'ROUND_OF_32',
  'LAST_32',
  'ROUND_OF_16',
  'LAST_16',
  'QUARTER_FINALS',
  'SEMI_FINALS',
  'THIRD_PLACE',
  'FINAL',
];

async function main() {
  // Specific stages first; the matchday catch-all runs last so knockout rounds
  // that also carry a (stale) matchday are already claimed as knockout.
  const steps: Array<{ label: string; phase: string; apply: (q: any) => any }> = [
    { label: 'GROUP_STAGE → group', phase: 'group', apply: (q) => q.eq('stage', 'GROUP_STAGE') },
    { label: 'LEAGUE_STAGE → league', phase: 'league', apply: (q) => q.eq('stage', 'LEAGUE_STAGE') },
    { label: 'knockout stages → knockout', phase: 'knockout', apply: (q) => q.in('stage', KNOCKOUT_STAGES) },
    { label: 'matchday rows → league', phase: 'league', apply: (q) => q.not('matchday', 'is', null) },
  ];

  for (const step of steps) {
    const { data, error } = await step
      .apply(supabase.from('fixtures').update({ phase: step.phase }).is('phase', null))
      .select('id');
    if (error) throw error;
    console.log(`  ${step.label}: ${data?.length ?? 0} rows`);
  }

  const { count, error } = await supabase
    .from('fixtures')
    .select('id', { count: 'exact', head: true })
    .is('phase', null);
  if (error) throw error;
  console.log(`[backfill-fixture-phase] done. phase still null: ${count} rows (expected: TBD placeholders with no matchday/stage).`);
}

main().catch((e) => {
  console.error('[backfill-fixture-phase] fatal:', e);
  process.exit(1);
});
