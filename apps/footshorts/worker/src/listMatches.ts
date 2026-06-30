/**
 * List football-data.org match ids for a competition over a date window.
 *
 * Debug/admin helper for finding the FD match id you need to feed into
 * `match:refresh` or `match:score`. Calls
 * `GET /competitions/{code}/matches?dateFrom&dateTo` and prints one line per match.
 *
 * Usage:
 *   npm run match:list -- WC                         # default window: last 7 days
 *   npm run match:list -- WC --from=2026-06-20 --to=2026-06-30
 *   npm run match:list -- PL --days=14               # last 14 days
 *
 * Competition codes: PL PD BL1 SA FL1 CL EL WC EC DED PPL BSA ELC
 */

import { fdFetch, FD_TOKEN } from './footballData';

type Side = { home: number | null; away: number | null };

type FdMatch = {
  id: number;
  utcDate: string;
  status: string;
  stage?: string | null;
  matchday?: number | null;
  homeTeam: { name?: string };
  awayTeam: { name?: string };
  score: { fullTime: Side };
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function flag(name: string): string | undefined {
  const a = process.argv.slice(2).find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : undefined;
}

function pair(s: Side): string {
  if (s.home === null && s.away === null) return '–';
  return `${s.home ?? '-'}-${s.away ?? '-'}`;
}

async function main() {
  if (!FD_TOKEN) throw new Error('FOOTBALL_DATA_TOKEN required');

  // Competition code is the first non-flag positional arg.
  const code = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!code) {
    throw new Error('usage: npm run match:list -- <COMP> [--from=YYYY-MM-DD --to=YYYY-MM-DD | --days=N]');
  }

  // Window: explicit --from/--to wins, else last --days (default 7).
  const today = new Date();
  const days = Number(flag('days') ?? 7);
  const dateFrom = flag('from') ?? ymd(new Date(today.getTime() - days * 86400_000));
  const dateTo = flag('to') ?? ymd(today);

  const data = await fdFetch<{ matches: FdMatch[] }>(
    `/competitions/${code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,
  );

  console.log(`[${code}] ${dateFrom} → ${dateTo}: ${data.matches.length} matches\n`);
  for (const m of data.matches) {
    const when = m.utcDate.replace('T', ' ').replace(':00Z', 'Z');
    const stage = m.stage ? ` (${m.stage})` : '';
    console.log(
      `${String(m.id).padEnd(8)} ${when}  ${m.status.padEnd(10)} ` +
        `${(m.homeTeam?.name ?? 'TBD').padEnd(22)} ${pair(m.score.fullTime).padStart(5)}  ` +
        `${m.awayTeam?.name ?? 'TBD'}${stage}`,
    );
  }
}

main().catch((e) => {
  console.error('[match:list] fatal:', (e as Error).message);
  process.exit(1);
});
