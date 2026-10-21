/**
 * Moves the football-seasons club marks between the workspace and the private
 * admin_club_marks table, where the admin Books → Crests "Club marks" view generates
 * each mark (toClubMark) and editors work the review queue.
 *
 *   --push   data/kits.csv → the kit columns, data/mark_overrides.csv → the seed design
 *            (family, rim, pattern, c1, c2, charges). Never touches the review overrides or the generated mark; the admin
 *            flags a mark whose inputs changed for regeneration.
 *   --pull   generated marks → data/club_marks.csv (one row per club per crest era, the
 *            spec's row: code, crest, pattern, c1, c2, ring, charge, league, from, to + the review state).
 *
 *   pnpm history:club-marks-sync -- --season=2003 (--push | --pull) [--dry-run] [--dir=…]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  CLUB_MARK_KIT_COLUMNS, CLUB_MARK_SEED_COLUMNS, CLUB_MARKS_CSV_HEADER, HISTORY_CLUB_MARKS_TABLE, HISTORY_CRESTS_TABLE,
} from '@footshorts/shared/historicalCrests';
import { parseCsv, toCsv } from './csv';

const DEFAULT_DIR = resolve(import.meta.dirname, '../../../../vizmaya-data/football-seasons');
const BATCH = 100;

async function main() {
  const args = process.argv.slice(2).filter(a => a !== '--');
  const ok = args.every(a => ['--push', '--pull', '--dry-run'].includes(a) || /^--(season|dir)=/.test(a));
  const start = Number(args.find(a => a.startsWith('--season='))?.slice(9));
  const push = args.includes('--push'), pull = args.includes('--pull');
  if (!ok || !Number.isInteger(start) || push === pull) {
    throw new Error('Usage: history:club-marks-sync -- --season=2003 (--push | --pull) [--dry-run] [--dir=path]');
  }
  const season = `${start}-${String(start + 1).slice(2)}`;
  const dir = resolve(args.find(a => a.startsWith('--dir='))?.slice(6) ?? DEFAULT_DIR);
  const dry = args.includes('--dry-run');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  if (pull) {
    const [{ data: marks, error }, { data: crests, error: e2 }] = await Promise.all([
      sb.from(HISTORY_CLUB_MARKS_TABLE).select('wiki,code,crest,pattern,c1,c2,ring,rim,charge,league,era_from,era_to,family_confidence,needs_review,review_reasons,reviewed_by,status')
        .eq('season', season).eq('status', 'ok'),
      sb.from(HISTORY_CRESTS_TABLE).select('wiki,name').eq('season', season),
    ]);
    if (error || e2) throw new Error(`Club marks are unavailable. Apply the admin_club_marks migration first: ${(error ?? e2)!.message}`);
    const names = new Map((crests ?? []).map(c => [c.wiki as string, c.name as string]));
    const rows = (marks ?? []).sort((a, b) => (a.wiki as string).localeCompare(b.wiki as string)).map(m => [
      season, m.wiki, names.get(m.wiki) ?? '', m.code, m.crest, m.pattern, m.c1, m.c2 ?? '', m.ring ?? '', m.rim ?? '', m.charge ?? '', m.league ?? '',
      m.era_from ?? '', m.era_to ?? '',
      m.family_confidence ?? '', m.needs_review ? 'yes' : '', (m.review_reasons ?? []).join('; '), m.reviewed_by ?? '',
    ].map(String));
    const file = join(dir, 'data/club_marks.csv');
    let keep: string[][] = [];
    try {
      const [, ...body] = parseCsv(readFileSync(file, 'utf8')).filter(r => r.length > 1);
      keep = body.filter(r => r[0] !== season);
    } catch { /* first pull */ }
    if (!dry) writeFileSync(file, toCsv([[...CLUB_MARKS_CSV_HEADER], ...keep, ...rows]));
    console.log(JSON.stringify({ season, pulled: rows.length, needsReview: rows.filter(r => r[CLUB_MARKS_CSV_HEADER.indexOf('needs_review')] === 'yes').length, into: file, dryRun: dry }));
    return;
  }

  const file = join(dir, 'data/kits.csv');
  const [header, ...body] = parseCsv(readFileSync(file, 'utf8')).filter(r => r.length > 1);
  if (!header) throw new Error(`${file} is empty`);
  const mine = body.map(cells => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']))).filter(r => r.season === season);
  if (!mine.length) throw new Error(`No ${season} kits in ${file}. Run scripts/kits.py fetch + build --season ${start} first.`);
  const { data: crests, error } = await sb.from(HISTORY_CRESTS_TABLE).select('wiki').eq('season', season);
  if (error) throw new Error(error.message);
  const known = new Set((crests ?? []).map(c => c.wiki as string));
  // Editorial family / charge defaults; a club missing from the file gets none (so a removed row clears).
  let seeds = new Map<string, Record<string, string>>();
  try {
    const [sh, ...sb2] = parseCsv(readFileSync(join(dir, 'data/mark_overrides.csv'), 'utf8')).filter(r => r.length > 1);
    seeds = new Map(sb2.map(cells => Object.fromEntries(sh!.map((h, i) => [h, cells[i] ?? '']))).filter(r => r.season === season).map(r => [r.wiki!, r]));
  } catch { /* no mark overrides yet */ }
  const payload = mine.filter(r => known.has(r.wiki ?? '')).map(r => {
    const row: Record<string, unknown> = { season, wiki: r.wiki };
    for (const [csv, col] of Object.entries(CLUB_MARK_SEED_COLUMNS)) row[col] = seeds.get(r.wiki ?? '')?.[csv] || null;
    for (const [csv, col] of Object.entries(CLUB_MARK_KIT_COLUMNS)) {
      row[col] = csv === 'needs_review' ? r[csv] === 'yes' : csv === 'confidence' ? (r[csv] ? Number(r[csv]) : null) : (r[csv] ?? '');
    }
    return row;
  });
  if (!dry) {
    for (let i = 0; i < payload.length; i += BATCH) {
      const { error: e } = await sb.from(HISTORY_CLUB_MARKS_TABLE).upsert(payload.slice(i, i + BATCH), { onConflict: 'season,wiki' });
      if (e) throw new Error(`Push stopped after ${i} rows: ${e.message}`);
      await new Promise(r => setTimeout(r, 300));
    }
  }
  console.log(JSON.stringify({
    season, pushed: payload.length, notInCrests: mine.length - payload.length,
    withoutKit: payload.filter(p => !p.kit_c1).length, kitFlagged: payload.filter(p => p.kit_needs_review).length, dryRun: dry,
  }));
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Sync failed'); process.exitCode = 1; });
