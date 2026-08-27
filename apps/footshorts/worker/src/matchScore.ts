/**
 * Print the score of a single football-data.org match.
 *
 * One-shot debug helper: given an FD match id, fetch `GET /matches/{id}` and print
 * a human-readable scoreline. Surfaces the bits the v4 score object actually carries
 * — fullTime, halfTime, plus `duration`/`winner` — so penalty-decided ties read
 * correctly instead of looking like draws (the shootout tally itself isn't exposed
 * by the API; see docs/football-data-api.md).
 *
 * Run via: `npm run match:score -- 419291`  (or `MATCH_ID=419291 npm run match:score`)
 */

import { fdFetch, FD_TOKEN } from './footballData';

type Side = { home: number | null; away: number | null };

type FdMatch = {
  id: number;
  utcDate: string;
  status: string;
  competition?: { name?: string };
  homeTeam: { name?: string };
  awayTeam: { name?: string };
  score: {
    winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
    duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT' | string;
    fullTime: Side;
    halfTime: Side;
  };
};

function pair(s: Side): string {
  return `${s.home ?? '-'}–${s.away ?? '-'}`;
}

async function main() {
  if (!FD_TOKEN) throw new Error('FOOTBALL_DATA_TOKEN required');

  // Accept the id as a positional arg (`-- 419291`) or via MATCH_ID env.
  const arg = process.argv.slice(2).find((a) => /^\d+$/.test(a));
  const id = arg ?? process.env.MATCH_ID;
  if (!id || !/^\d+$/.test(id)) {
    throw new Error('usage: npm run match:score -- <matchId>   (e.g. 419291)');
  }

  const m = await fdFetch<FdMatch>(`/matches/${id}`);

  const home = m.homeTeam?.name ?? 'Home';
  const away = m.awayTeam?.name ?? 'Away';
  const comp = m.competition?.name ? `${m.competition.name} · ` : '';

  console.log(`${comp}${home} vs ${away}`);
  console.log(`  kickoff:  ${m.utcDate}`);
  console.log(`  status:   ${m.status} (${m.score.duration})`);
  console.log(`  fulltime: ${pair(m.score.fullTime)}`);
  console.log(`  halftime: ${pair(m.score.halfTime)}`);

  // v4 has no separate shootout scoreline — `winner` is all we get for a PK tie.
  if (m.score.duration === 'PENALTY_SHOOTOUT') {
    console.log(`  decided on penalties — winner: ${m.score.winner ?? 'unknown'}`);
  }
}

main().catch((e) => {
  console.error('[match:score] fatal:', (e as Error).message);
  process.exit(1);
});
