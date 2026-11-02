/**
 * Loads a season book's data packs and backfilled editorial rows.
 *
 *   --push   data/spread_packs/<season>/packs/*.json → admin_spread_packs, one
 *            pack at a time; the same pack (hash) is left alone.
 *   --plan   rows.json → the book's plan. Fills empty fields only, so whatever
 *            an editor has written stays; every row gets its pack reference.
 *            A save goes through the book's `revision`, like the admin's.
 *   --replace   with --plan: rows.json wins for the fields it carries, for rows
 *            whose editorial was written before the backfill.
 *
 *   pnpm history:spread-packs -- --season=2003 (--push | --plan) [--replace] [--dry-run] [--out=file] [--dir=…]
 *
 * Packs are small, but this is the shared Supabase project, so they go in series
 * with a pause: JSONB write bursts have taken the instance down before.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_DIR = resolve(import.meta.dirname, '../../../../vizmaya-data/football-seasons');
const PACKS = 'admin_spread_packs';
const BOOKS = 'admin_season_books';
const PAUSE_MS = 250;

type Json = Record<string, any>;

const hashOf = (text: string) => createHash('sha256').update(text).digest('hex');

/** `incoming` into `current`: a blank field takes the incoming value, a written one stays. */
function fill(current: Json, incoming: Json): Json {
  const out: Json = { ...current };
  for (const [k, v] of Object.entries(incoming)) {
    const have = out[k];
    if (have && typeof have === 'object' && !Array.isArray(have) && v && typeof v === 'object' && !Array.isArray(v)) out[k] = fill(have, v);
    else if (have === undefined || have === null || have === '' || (Array.isArray(have) && !have.length)) out[k] = v;
  }
  return out;
}

const blankRow = (key: string, r: Json, part: string): Json => ({
  key,
  kind: r.kind,
  subjectId: r.subject,
  part,
  templateVersion: { team: 'team@1.2', league: 'league@1.0', competition: 'competition@1.0' }[r.kind as string],
  status: 'data',
  editorial: { headline: '', storyStat: { value: '', label: '', source: null }, story: '', moments: [], highlight: [], notes: {} },
  team: r.kind === 'team' ? { turningPoint: null, cupParagraphs: {}, cupVariant: {}, coach: { name: '', context: '', assistants: '', sourceUrl: '' }, xiSplitDate: null, storyPlayers: [], heatmapPlayers: [] } : null,
  league: r.kind === 'league' ? { awards: [], leadAnnotations: [], halfwayNote: '' } : null,
  competition: r.kind === 'competition' ? { oddities: [], pinned: [], mapGrouping: 'country' } : null,
  modules: {},
  palette: null,
  pack: null,
  checkOverrides: [],
});

/** The part a subject sits in, from the plan's own parts. */
function partOf(plan: Json, key: string, r: Json): string | null {
  for (const p of plan.parts) {
    if (p.kind === 'league' && (r.subject === p.league || p.teams.includes(r.subject))) return p.id;
    if (p.kind === 'european' && p.competitions.includes(r.subject)) return p.id;
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2).filter(a => a !== '--');
  const ok = args.every(a => ['--push', '--plan', '--replace', '--dry-run'].includes(a) || /^--(season|dir|out)=/.test(a));
  const start = Number(args.find(a => a.startsWith('--season='))?.slice(9));
  const push = args.includes('--push'), plan = args.includes('--plan');
  if (!ok || !Number.isInteger(start) || push === plan) {
    throw new Error('Usage: history:spread-packs -- --season=2003 (--push | --plan) [--replace] [--dry-run] [--out=file] [--dir=path]');
  }
  const season = `${start}-${String(start + 1).slice(2)}`;
  const dir = join(resolve(args.find(a => a.startsWith('--dir='))?.slice(6) ?? DEFAULT_DIR), 'data/spread_packs', season);
  const dry = args.includes('--dry-run');
  const sb = createClient(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  const packs = readdirSync(join(dir, 'packs')).filter(f => f.endsWith('.json')).sort().map(f => {
    const text = readFileSync(join(dir, 'packs', f), 'utf8');
    return { key: f.replace(/\.json$/, '').replace('__', ':'), text, hash: hashOf(text) };
  });

  if (push) {
    let wrote = 0;
    for (const p of packs) {
      if (dry) { console.log(`would push ${p.key} ${p.hash.slice(0, 8)} (${p.text.length} bytes)`); continue; }
      const { data: have, error: readError } = await sb.from(PACKS).select('hash').eq('season_start', start).eq('spread_key', p.key).eq('hash', p.hash).maybeSingle();
      if (readError) throw new Error(readError.message);
      if (have) continue;
      const { error } = await sb.from(PACKS).insert({ season_start: start, spread_key: p.key, hash: p.hash, pack: JSON.parse(p.text) });
      if (error) throw new Error(`${p.key}: ${error.message}`);
      wrote++;
      await sleep(PAUSE_MS);
    }
    console.log(`${season}: ${packs.length} packs, ${wrote} new`);
    return;
  }

  const rows: Json = JSON.parse(readFileSync(join(dir, 'rows.json'), 'utf8'));
  const { data: book, error } = await sb.from(BOOKS).select('slug,plan,revision').eq('slug', season).maybeSingle();
  if (error) throw new Error(error.message);
  if (!book) throw new Error(`No book for ${season}`);
  const next: Json = structuredClone(book.plan);
  if (next.version !== 2) throw new Error(`${season} is not a season-spreads book`);
  const hashes = new Map(packs.map(p => [p.key, p.hash]));
  const builtAt = new Date().toISOString();
  const kept: string[] = [];
  for (const [key, r] of Object.entries<Json>(rows)) {
    const part = partOf(next, key, r);
    if (!part) throw new Error(`${key}: not in the book's parts`);
    const current: Json = next.spreads[key] ?? blankRow(key, r, part);
    const incoming: Json = { editorial: r.editorial, palette: r.palette, ...(r.team ? { team: r.team } : {}), ...(r.league ? { league: r.league } : {}) };
    const merged = fill(current, incoming);
    if (args.includes('--replace')) merged.editorial = { ...merged.editorial, ...r.editorial };
    if (merged.palette === null && r.palette) merged.palette = r.palette;
    const e = current.editorial;
    for (const f of ['headline', 'story'] as const) if (e[f] && e[f] !== r.editorial[f]) kept.push(`${key} ${f}: ${e[f]}`);
    if (e.storyStat.value && e.storyStat.value !== r.editorial.storyStat.value) kept.push(`${key} stat: ${e.storyStat.value}`);
    if (e.moments.length && JSON.stringify(e.moments) !== JSON.stringify(r.editorial.moments)) kept.push(`${key} moments: ${e.moments.length}`);
    const hash = hashes.get(key);
    merged.pack = hash ? { id: key, hash, builtAt } : merged.pack;
    if (merged.status === 'data') merged.status = 'draft';
    next.spreads[key] = merged;
  }
  const drafted = Object.values<Json>(next.spreads).filter(s => s.status !== 'data').length;
  console.log(`${season}: ${Object.keys(rows).length} rows onto revision ${book.revision}, ${drafted} spreads drafted`);
  if (kept.length) console.log(args.includes('--replace') ? 'Replaced:' : 'Kept as written:', kept);
  const out = args.find(a => a.startsWith('--out='))?.slice(6);
  if (out) writeFileSync(out, JSON.stringify(next));
  if (dry) return;
  const { data: saved, error: saveError } = await sb.from(BOOKS).update({
    plan: next, carded_count: drafted, revision: book.revision + 1, updated_at: builtAt, updated_by: 'history:spread-packs',
  }).eq('slug', season).eq('revision', book.revision).select('revision').maybeSingle();
  if (saveError) throw new Error(saveError.message);
  if (!saved) throw new Error('Someone saved the book since it was read; nothing written. Run it again.');
  console.log(`Saved revision ${saved.revision}`);
}

main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
