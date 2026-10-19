/**
 * Moves the football-seasons club crests between data/crests.csv (built by
 * scripts/crests.py) and the private admin_season_crests table, which the admin
 * Books → Crests viewer reads and where editors upload missing or wrong crests.
 *
 *   --push   crests.csv → table. Overwrites the picked crest only; an upload made
 *            in the admin is never replaced.
 *   --pull   uploaded files → raw/crests/<season>-uploads/<slug>.<ext> (+ uploads.csv:
 *            wiki, slug, file, uploaded_by, uploaded_at), so the book layouts can use them.
 *
 *   pnpm history:crests-sync -- --season=2003 (--push | --pull) [--prune] [--dry-run] [--dir=…]
 *
 * --prune (with --push) deletes this season's rows that are no longer in the CSV
 * and carry no upload.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { HISTORY_CREST_CONTENT_COLUMNS, HISTORY_CRESTS_BUCKET, HISTORY_CRESTS_TABLE } from '@footshorts/shared/historicalCrests';
import { parseCsv, toCsv } from './csv';

const DEFAULT_DIR = resolve(import.meta.dirname, '../../../../vizmaya-data/football-seasons');
const BATCH = 200;

async function main() {
  const args = process.argv.slice(2).filter(a => a !== '--');
  const ok = args.every(a => ['--push', '--pull', '--prune', '--dry-run'].includes(a) || /^--(season|dir)=/.test(a));
  const start = Number(args.find(a => a.startsWith('--season='))?.slice(9));
  const push = args.includes('--push'), pull = args.includes('--pull');
  if (!ok || !Number.isInteger(start) || push === pull) {
    throw new Error('Usage: history:crests-sync -- --season=2003 (--push | --pull) [--prune] [--dry-run] [--dir=path]');
  }
  const season = `${start}-${String(start + 1).slice(2)}`;
  const dir = resolve(args.find(a => a.startsWith('--dir='))?.slice(6) ?? DEFAULT_DIR);
  const dry = args.includes('--dry-run');

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: existing, error } = await sb.from(HISTORY_CRESTS_TABLE)
    .select('wiki,slug,upload_path,uploaded_by,uploaded_at').eq('season', season);
  if (error) throw new Error(`Crest storage is unavailable. Apply the admin_season_crests migration first: ${error.message}`);
  const inDb = new Map((existing ?? []).map(r => [r.wiki as string, r as { wiki: string; slug: string; upload_path: string | null; uploaded_by: string | null; uploaded_at: string | null }]));

  if (pull) {
    const uploads = [...inDb.values()].filter(r => r.upload_path);
    const out = join(dir, 'raw/crests', `${season}-uploads`);
    const manifest: string[][] = [['wiki', 'slug', 'file', 'uploaded_by', 'uploaded_at']];
    if (!dry) mkdirSync(out, { recursive: true });
    for (const r of uploads) {
      const name = `${r.slug || r.wiki.replace(/[^\w-]+/g, '-')}.${r.upload_path!.split('.').pop()}`;
      if (!dry) {
        const { data, error: e } = await sb.storage.from(HISTORY_CRESTS_BUCKET).download(r.upload_path!);
        if (e || !data) throw new Error(`Could not download ${r.upload_path}: ${e?.message ?? 'no data'}`);
        writeFileSync(join(out, name), Buffer.from(await data.arrayBuffer()));
      }
      manifest.push([r.wiki, r.slug, name, r.uploaded_by ?? '', r.uploaded_at ?? '']);
    }
    if (!dry) writeFileSync(join(out, 'uploads.csv'), toCsv(manifest));
    console.log(JSON.stringify({ season, pulled: uploads.length, into: out, dryRun: dry }));
    return;
  }

  const file = join(dir, 'data/crests.csv');
  const [header, ...body] = parseCsv(readFileSync(file, 'utf8')).filter(r => r.length > 1);
  if (!header) throw new Error(`${file} is empty`);
  const mine = body.map(cells => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']))).filter(r => r.season === season);
  if (!mine.length) throw new Error(`No ${season} crests in ${file}. Run crests.py build --season ${start} first.`);

  const payload = mine.map(r => {
    const row: Record<string, unknown> = {};
    for (const c of HISTORY_CREST_CONTENT_COLUMNS) row[c] = c === 'needs_review' ? r[c] === 'yes' : (r[c] ?? '');
    return row;
  });
  const wikis = new Set(payload.map(p => p.wiki as string));
  const stale = [...inDb.values()].filter(r => !wikis.has(r.wiki));
  const prunable = stale.filter(r => !r.upload_path);
  if (!dry) {
    for (let i = 0; i < payload.length; i += BATCH) {
      const { error: e } = await sb.from(HISTORY_CRESTS_TABLE).upsert(payload.slice(i, i + BATCH), { onConflict: 'season,wiki' });
      if (e) throw new Error(`Push stopped after ${i} rows: ${e.message}`);
    }
    if (args.includes('--prune') && prunable.length) {
      const { error: e } = await sb.from(HISTORY_CRESTS_TABLE).delete().eq('season', season).in('wiki', prunable.map(r => r.wiki));
      if (e) throw new Error(`Prune failed: ${e.message}`);
    }
  }
  const missing = mine.filter(r => !r.file_url).length;
  console.log(JSON.stringify({
    season, pushed: payload.length, new: payload.filter(p => !inDb.has(p.wiki as string)).length, withoutCrest: missing,
    notInCsv: stale.length, pruned: args.includes('--prune') ? prunable.length : 0,
    keptBecauseUploaded: stale.length - prunable.length, dryRun: dry,
  }));
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Sync failed'); process.exitCode = 1; });
