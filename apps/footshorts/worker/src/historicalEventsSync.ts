/**
 * Moves the football-seasons book events between data/events.csv (built by
 * scripts/events.py) and the private admin_historical_events table, where the
 * admin "Season events" tab fact-checks them.
 *
 *   --push   events.csv → table. Overwrites event content only; a verdict or note
 *            made in the admin is never replaced. A check already in the CSV (made
 *            before the admin page existed) seeds rows that have none yet.
 *   --pull   table → events.csv verified / notes, so `events.py build` keeps them.
 *
 *   pnpm history:events-sync -- --season=2003 (--push | --pull) [--prune] [--dry-run] [--dir=…]
 *
 * --prune (with --push) deletes this season's table rows that are no longer in the
 * CSV and carry no verdict or note — what's left after events are re-extracted.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { HISTORY_EVENTS_TABLE, HISTORY_EVENT_CONTENT_COLUMNS, isHistoryVerdict } from '@footshorts/shared/historicalEvents';
import { parseCsv, toCsv } from './csv';

const DEFAULT_DIR = resolve(import.meta.dirname, '../../../../vizmaya-data/football-seasons');
const BATCH = 200;

/** Same key as events.py event_id(): survives a rebuild while the event is unchanged. */
const eventId = (r: Record<string, string>) =>
  createHash('sha1').update([r.origin, r.date, r.type, r.summary].join('|')).digest('hex').slice(0, 16);

async function main() {
  const args = process.argv.slice(2).filter(a => a !== '--');
  const ok = args.every(a => ['--push', '--pull', '--prune', '--dry-run'].includes(a) || /^--(season|dir)=/.test(a));
  const start = Number(args.find(a => a.startsWith('--season='))?.slice(9));
  const push = args.includes('--push'), pull = args.includes('--pull');
  if (!ok || !Number.isInteger(start) || push === pull) {
    throw new Error('Usage: history:events-sync -- --season=2003 (--push | --pull) [--prune] [--dry-run] [--dir=path]');
  }
  const season = `${start}-${String(start + 1).slice(2)}`;
  const file = join(resolve(args.find(a => a.startsWith('--dir='))?.slice(6) ?? DEFAULT_DIR), 'data/events.csv');
  const dry = args.includes('--dry-run');

  const [header, ...body] = parseCsv(readFileSync(file, 'utf8')).filter(r => r.length > 1);
  if (!header) throw new Error(`${file} is empty`);
  const rows = body.map(cells => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])));
  const mine = rows.filter(r => r.season === season);
  if (!mine.length) throw new Error(`No ${season} events in ${file}. Run events.py build --season ${start} first.`);

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: existing, error } = await sb.from(HISTORY_EVENTS_TABLE).select('id,verified,notes').eq('season', season);
  if (error) throw new Error(`Event storage is unavailable. Apply the admin_historical_events migration first: ${error.message}`);
  const inDb = new Map((existing ?? []).map(r => [r.id as string, r as { id: string; verified: string; notes: string }]));

  if (pull) {
    let changed = 0;
    for (const r of mine) {
      const db = inDb.get(eventId(r));
      if (db && (r.verified !== db.verified || r.notes !== db.notes)) { r.verified = db.verified; r.notes = db.notes; changed++; }
    }
    if (!dry) writeFileSync(file, toCsv([header, ...rows.map(r => header.map(h => r[h] ?? ''))]));
    const checked = mine.filter(r => r.verified).length;
    console.log(JSON.stringify({ season, pulled: changed, checked, of: mine.length, dryRun: dry }));
    return;
  }

  const payload = mine.map(r => {
    const id = eventId(r);
    const row: Record<string, unknown> = { id };
    for (const c of HISTORY_EVENT_CONTENT_COLUMNS) row[c] = c === 'importance' ? Number(r[c] || 1) : (r[c] ?? '');
    const db = inDb.get(id);
    if ((!db || (!db.verified && !db.notes)) && (r.verified || r.notes)) {
      row.verified = isHistoryVerdict(r.verified) ? r.verified : '';
      row.notes = r.notes ?? '';
    }
    return row;
  });
  // Rows from a single upsert must share one column set, so send the two shapes apart.
  const withCheck = payload.filter(p => 'verified' in p), contentOnly = payload.filter(p => !('verified' in p));
  const ids = new Set(payload.map(p => p.id as string));
  const stale = [...inDb.values()].filter(r => !ids.has(r.id));
  const prunable = stale.filter(r => !r.verified && !r.notes);
  if (!dry) {
    for (const group of [contentOnly, withCheck]) {
      for (let i = 0; i < group.length; i += BATCH) {
        const { error: e } = await sb.from(HISTORY_EVENTS_TABLE).upsert(group.slice(i, i + BATCH), { onConflict: 'id' });
        if (e) throw new Error(`Push stopped after ${i} rows: ${e.message}`);
      }
    }
    if (args.includes('--prune') && prunable.length) {
      const { error: e } = await sb.from(HISTORY_EVENTS_TABLE).delete().in('id', prunable.map(r => r.id));
      if (e) throw new Error(`Prune failed: ${e.message}`);
    }
  }
  console.log(JSON.stringify({
    season, pushed: payload.length, new: payload.filter(p => !inDb.has(p.id as string)).length,
    seededChecks: withCheck.length, notInCsv: stale.length,
    pruned: args.includes('--prune') ? prunable.length : 0, keptBecauseChecked: stale.length - prunable.length, dryRun: dry,
  }));
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Sync failed'); process.exitCode = 1; });
