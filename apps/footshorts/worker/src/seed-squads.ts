/**
 * Seed WC26 squads.
 *
 * Usage:
 *   npm run seed:squads -- --source=wikipedia --country=ENG
 *   npm run seed:squads -- --source=press_release --country=BRA --url=https://...
 *   npm run seed:squads -- --source=manual --country=KSA --text-file=./paste.txt
 *   npm run seed:squads -- --source=wikipedia --country=ENG,MAR,KSA  (multiple)
 *   npm run seed:squads -- --source=wikipedia --country=all          (every WC26 nation)
 *
 * --dry-run prints what would be inserted without writing.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fetchSquadFromWikipedia, clearWikipediaCache } from './squads/adapters/wikipedia';
import { fetchSquadFromPressRelease } from './squads/adapters/press-release';
import { extractSquadFromManualText } from './squads/adapters/manual';
import { processSquad } from './squads/process';
import { ProcessResult, RawSquadEntry, SquadSource } from './squads/types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

type Args = {
  source: SquadSource;
  countries: string[];
  url?: string;
  text?: string;
  textFile?: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = { dryRun: false };
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2] ?? 'true';
    if (key === 'source') out.source = value as SquadSource;
    else if (key === 'country') out.countries = value.split(',').map((c) => c.trim()).filter(Boolean);
    else if (key === 'url') out.url = value;
    else if (key === 'text') out.text = value;
    else if (key === 'text-file') out.textFile = value;
    else if (key === 'dry-run') out.dryRun = value !== 'false';
  }
  if (!out.source || !['wikipedia', 'press_release', 'manual'].includes(out.source)) {
    throw new Error('--source=wikipedia|press_release|manual required');
  }
  if (!out.countries || out.countries.length === 0) {
    throw new Error('--country=<CODE>[,<CODE>...] or --country=all required');
  }
  if (out.source === 'press_release' && !out.url) {
    throw new Error('--url=<URL> required for source=press_release');
  }
  if (out.source === 'manual' && !out.text && !out.textFile) {
    throw new Error('--text=<TEXT> or --text-file=<PATH> required for source=manual');
  }
  return out as Args;
}

async function resolveCountries(codes: string[]): Promise<{ code: string; name: string }[]> {
  if (codes.length === 1 && codes[0]?.toLowerCase() === 'all') {
    const { data, error } = await supabase
      .from('fifa_wc26_teams')
      .select('code, name')
      .order('name');
    if (error) throw error;
    return data ?? [];
  }
  const { data, error } = await supabase
    .from('fifa_wc26_teams')
    .select('code, name')
    .in('code', codes);
  if (error) throw error;
  const found = new Set((data ?? []).map((r) => r.code));
  const missing = codes.filter((c) => !found.has(c));
  if (missing.length) {
    throw new Error(`Unknown country code(s): ${missing.join(', ')}`);
  }
  return data ?? [];
}

async function fetchEntries(
  args: Args,
  country: { code: string; name: string }
): Promise<RawSquadEntry[]> {
  if (args.source === 'wikipedia') {
    return fetchSquadFromWikipedia(country.name);
  }
  if (args.source === 'press_release') {
    return fetchSquadFromPressRelease(args.url!);
  }
  const text = args.text ?? readFileSync(args.textFile!, 'utf8');
  return extractSquadFromManualText(text);
}

function printResult(r: ProcessResult, dryRun: boolean) {
  const tag = dryRun ? '[dry-run]' : '[seed:squads]';
  console.log(
    `${tag} ${r.country_code} | source=${r.source} ` +
    `players=${r.players_seen} (new=${r.players_inserted} upd=${r.players_updated}) ` +
    `clubs=${r.clubs_matched}/${r.clubs_matched + r.clubs_unmatched} matched`
  );
  if (r.unmatched_club_names.length) {
    console.log(`  unmatched clubs: ${r.unmatched_club_names.join(' · ')}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const countries = await resolveCountries(args.countries);
  console.log(
    `[seed:squads] source=${args.source} countries=${countries.map((c) => c.code).join(',')} ` +
    `dryRun=${args.dryRun}`
  );

  // Clear the Wikipedia cache between CLI invocations (cheap; this is a fresh run).
  clearWikipediaCache();

  const announcedAt = new Date();
  const results: ProcessResult[] = [];

  for (const country of countries) {
    try {
      const entries = await fetchEntries(args, country);
      console.log(`[seed:squads] ${country.code} (${country.name}): parsed ${entries.length} entries`);

      if (args.dryRun) {
        console.log(JSON.stringify(entries, null, 2));
        results.push({
          country_code: country.code,
          source: args.source,
          players_seen: entries.length,
          players_inserted: 0,
          players_updated: 0,
          clubs_matched: 0,
          clubs_unmatched: 0,
          unmatched_club_names: [],
        });
        continue;
      }

      const result = await processSquad({
        supabase,
        countryCode: country.code,
        countryName: country.name,
        entries,
        source: args.source,
        announcedAt,
      });
      printResult(result, false);
      results.push(result);
    } catch (e: any) {
      console.error(`[seed:squads] ${country.code} FAILED: ${e?.message ?? e}`);
    }
  }

  // Summary
  const totalSeen = results.reduce((s, r) => s + r.players_seen, 0);
  const totalMatched = results.reduce((s, r) => s + r.clubs_matched, 0);
  const totalClubs = results.reduce((s, r) => s + r.clubs_matched + r.clubs_unmatched, 0);
  const matchRate = totalClubs > 0 ? ((totalMatched / totalClubs) * 100).toFixed(1) : '—';
  console.log(
    `[seed:squads] done. ${results.length} countries, ${totalSeen} players, ` +
    `club match rate ${matchRate}% (${totalMatched}/${totalClubs}).`
  );
}

main().catch((e) => {
  console.error('[seed:squads] fatal:', e);
  process.exit(1);
});
