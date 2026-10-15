/**
 * Manual-only bulk load of vizmaya-data/football-seasons/data/matches.csv into the
 * private admin_historical_matches table. No cron, no writes to public fixtures.
 *
 * Paced for the shared Supabase instance: each request stays under ~500KB and the
 * stream under ~400KB/s, and the first failed batch stops the run (no retry loop —
 * hammering a wedged instance takes every app down). Resume with --from=<row>.
 *
 *   pnpm history:import -- [--file=path/to/matches.csv] [--from=0] [--dry-run]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { parseCsv } from './csv';

const TABLE = 'admin_historical_matches';
const DEFAULT_FILE = resolve(import.meta.dirname, '../../../../vizmaya-data/football-seasons/data/matches.csv');
const MAX_BATCH_BYTES = 500_000;
const MAX_BATCH_ROWS = 1000;
const BYTES_PER_SECOND = 400_000;

const int = (v: string) => (v === '' ? null : Number.parseInt(v, 10));
const num = (v: string) => (v === '' ? null : Number(v));
const text = (v: string) => (v === '' ? null : v);

type CsvRow = Record<'date' | 'season' | 'month' | 'competition' | 'stage' | 'home' | 'away' | 'hg' | 'ag' | 'ht' | 'note' | 'source'
  | 'HS' | 'AS' | 'HST' | 'AST' | 'HC' | 'AC' | 'HY' | 'AY' | 'HR' | 'AR' | 'Referee' | 'Attendance'
  | 'HxG' | 'AxG' | 'B365H' | 'B365D' | 'B365A', string>;

function toRow(r: CsvRow) {
  const ht = /^(\d+)-(\d+)$/.exec(r.ht);
  return {
    match_date: r.date,
    season: r.season,
    season_start: Number.parseInt(r.season.slice(0, 4), 10),
    month: r.month,
    competition: r.competition,
    stage: text(r.stage),
    home_team: r.home,
    away_team: r.away,
    home_score: int(r.hg),
    away_score: int(r.ag),
    home_ht_score: ht ? Number(ht[1]) : null,
    away_ht_score: ht ? Number(ht[2]) : null,
    note: text(r.note),
    source: r.source,
    home_shots: int(r.HS),
    away_shots: int(r.AS),
    home_shots_on_target: int(r.HST),
    away_shots_on_target: int(r.AST),
    home_corners: int(r.HC),
    away_corners: int(r.AC),
    home_yellow_cards: int(r.HY),
    away_yellow_cards: int(r.AY),
    home_red_cards: int(r.HR),
    away_red_cards: int(r.AR),
    referee: text(r.Referee),
    attendance: int(r.Attendance),
    home_xg: num(r.HxG),
    away_xg: num(r.AxG),
    odds_b365_home: num(r.B365H),
    odds_b365_draw: num(r.B365D),
    odds_b365_away: num(r.B365A),
  };
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== '--');
  const allowed = args.every(a => a === '--dry-run' || a.startsWith('--file=') || a.startsWith('--from='));
  if (!allowed) throw new Error('Usage: history:import -- [--file=matches.csv] [--from=0] [--dry-run]');
  const file = args.find(a => a.startsWith('--file='))?.slice(7) ?? DEFAULT_FILE;
  const from = Number(args.find(a => a.startsWith('--from='))?.slice(7) ?? 0);
  if (!Number.isInteger(from) || from < 0) throw new Error('--from must be a non-negative row index');
  const dry = args.includes('--dry-run');

  const [header, ...body] = parseCsv(readFileSync(file, 'utf8')).filter(r => r.length > 1);
  if (!header) throw new Error(`${file} is empty`);
  const rows = body.map(cells => toRow(Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])) as CsvRow));
  const bad = rows.findIndex(r => !/^\d{4}-\d\d-\d\d$/.test(r.match_date) || !Number.isInteger(r.season_start) || !r.home_team || !r.away_team);
  if (bad !== -1) throw new Error(`Row ${bad} is malformed: ${JSON.stringify(body[bad])}`);

  // Pre-cut batches by serialized size so no request crosses the per-request cap.
  const batches: { start: number; rows: ReturnType<typeof toRow>[]; bytes: number }[] = [];
  let cur: (typeof batches)[number] = { start: from, rows: [], bytes: 2 };
  for (const [i, row] of rows.entries()) {
    if (i < from) continue;
    const bytes = JSON.stringify(row).length + 1;
    if (cur.rows.length && (cur.bytes + bytes > MAX_BATCH_BYTES || cur.rows.length >= MAX_BATCH_ROWS)) {
      batches.push(cur);
      cur = { start: i, rows: [], bytes: 2 };
    }
    cur.rows.push(row);
    cur.bytes += bytes;
  }
  if (cur.rows.length) batches.push(cur);
  const totalBytes = batches.reduce((s, b) => s + b.bytes, 0);
  console.log(JSON.stringify({ file, rows: rows.length, from, batches: batches.length,
    megabytes: +(totalBytes / 1e6).toFixed(1), estSeconds: Math.round(totalBytes / BYTES_PER_SECOND), dryRun: dry }));
  if (dry) return;

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { error: probe } = await sb.from(TABLE).select('id').limit(1);
  if (probe) throw new Error(`Private history storage is unavailable. Apply the admin_historical_matches migration first: ${probe.message}`);

  for (const [n, batch] of batches.entries()) {
    const started = Date.now();
    const { error } = await sb.from(TABLE).upsert(batch.rows, { onConflict: 'match_date,competition,home_team,away_team' });
    if (error) {
      console.error(`Batch ${n + 1}/${batches.length} failed: ${error.message}`);
      console.error(`Stopped without retrying. Check the instance is healthy, then resume with --from=${batch.start}`);
      process.exitCode = 1;
      return;
    }
    const done = batch.start + batch.rows.length;
    if ((n + 1) % 10 === 0 || n === batches.length - 1) console.log(`${done}/${rows.length} rows`);
    await sleep(Math.max(0, (batch.bytes / BYTES_PER_SECOND) * 1000 - (Date.now() - started)));
  }
  const { count } = await sb.from(TABLE).select('id', { count: 'exact', head: true });
  console.log(JSON.stringify({ imported: rows.length - from, tableCount: count }));
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Import failed'); process.exitCode = 1; });
