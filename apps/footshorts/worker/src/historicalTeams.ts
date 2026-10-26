/**
 * Layer 0 of the football-seasons workspace: one team-name crosswalk that every
 * later layer (ClubElo, Transfermarkt, narrative events) joins matches through.
 *
 * Reads the club names each source uses in data/matches.csv (+ the raw UCL files
 * for country codes), groups names that share a key under the same naming rule
 * and alias tables the Footshorts entity resolver uses, fuzzy-matches leftovers
 * within a country, and writes data/teams.csv — one row per club — for review.
 *
 * Read-only against Supabase (entities + entity_aliases); writes only local CSV.
 * Hand decisions go in data/teams_overrides.csv (source, raw_name → canonical_id;
 * canonical_id "-" on a clubelo row means "none of our clubs").
 * An override pins that name to the id and wins over every automatic rule, so
 * re-running never undoes a review.
 *
 * Transfermarkt names are copied by id from data/transfermarkt_clubs.csv (players.py tm-clubs).
 * ClubElo names (raw/clubelo/*.csv, from scripts/clubelo.py) only attach to
 * clubs the match sources already know — ClubElo's thousands of other clubs never
 * become rows. Pin a ClubElo name with source "clubelo" in the overrides file.
 *
 *   pnpm history:teams -- [--dir=vizmaya-data/football-seasons] [--clubelo-dir=path] [--offline]
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { normalizeEntityKey, teamLookupSlugs } from '@footshorts/shared/entityKeys';
import { parseCsv, toCsv } from './csv';

const DEFAULT_DIR = resolve(import.meta.dirname, '../../../../vizmaya-data/football-seasons');
const SOURCES = ['football-data.co.uk', 'openfootball', 'engsoccerdata'] as const;
type Source = (typeof SOURCES)[number];
const SOURCE_COLUMN: Record<Source, string> = {
  'football-data.co.uk': 'football_data_name',
  openfootball: 'openfootball_name',
  engsoccerdata: 'engsoccerdata_name',
};

const LEAGUE_COUNTRY: Record<string, string> = {
  'Premier League': 'ENG', Championship: 'ENG', 'Scottish Premiership': 'SCO', Bundesliga: 'GER',
  LaLiga: 'ESP', 'Serie A': 'ITA', 'Ligue 1': 'FRA', Eredivisie: 'NED', 'Primeira Liga': 'POR',
};
// Monaco plays in Ligue 1, so football-data files it under France.
const COUNTRY_FOLD: Record<string, string> = { MCO: 'FRA' };

/**
 * Spellings the Footshorts ENTITY_ALIASES table doesn't carry: football-data.co.uk's
 * abbreviations and the UCL sources' variants. Both sides are affix-stripped keys
 * (see stripAffixes); a pair only has to connect two spellings — which one ends up
 * as canonical_id is decided per group. Extend from teams.csv review.
 */
const HISTORY_ALIASES: Record<string, string> = {
  // England / Scotland
  'nott-m-forest': 'nottingham-forest', 'sheffield-weds': 'sheffield-wednesday', 'west-brom': 'west-bromwich-albion',
  'qpr': 'queens-park-rangers', 'wolves': 'wolverhampton-wanderers', 'mk-dons': 'milton-keynes-dons',
  'peterboro': 'peterborough-united', 'brighton': 'brighton-hove-albion', 'leicester': 'leicester-city',
  'hearts': 'heart-of-midlothian',
  // Spain
  'ath-madrid': 'atletico-madrid', 'ath-bilbao': 'athletic-bilbao', 'sp-gijon': 'sporting-gijon',
  'sociedad': 'real-sociedad', 'real-sociedad-de-futbol': 'real-sociedad', 'espanol': 'espanyol',
  'la-coruna': 'deportivo-la-coruna', 'vallecano': 'rayo-vallecano', 'celta': 'celta-vigo',
  'santander': 'racing-santander', 'malaga': 'malaga-cf',
  // Germany
  'm-gladbach': 'borussia-monchengladbach', 'bor-monchengladbach': 'borussia-monchengladbach',
  'ein-frankfurt': 'eintracht-frankfurt', 'leverkusen': 'bayer-leverkusen', 'bayer-04-leverkusen': 'bayer-leverkusen',
  'dortmund': 'borussia-dortmund', 'hoffenheim': 'tsg-hoffenheim', '1899-hoffenheim': 'tsg-hoffenheim',
  'stuttgart': 'vfb-stuttgart', 'wolfsburg': 'vfl-wolfsburg', 'bochum': 'vfl-bochum', '1-union-berlin': 'union-berlin',
  'hamburg': 'hamburger-sv', 'schalke-04': 'schalke', 'bayern-munchen': 'bayern-munich', 'koln': '1-koln',
  // Italy
  'internazionale': 'inter', 'internazionale-milano': 'inter', 'lazio-roma': 'lazio', 'chievo': 'chievo-verona',
  // France
  'paris-sg': 'paris-saint-germain', 'st-etienne': 'saint-etienne', 'lyon': 'olympique-lyonnais',
  'olympique-lyon': 'olympique-lyonnais', 'marseille': 'olympique-marseille', 'olympique-de-marseille': 'olympique-marseille',
  'lille-osc': 'lille', 'racing-club-de-lens': 'lens', 'girondins-bordeaux': 'bordeaux', 'stade-rennais': 'rennes',
  'stade-brestois-29': 'brest', 'montpellier-hsc': 'montpellier',
  // Netherlands / Portugal
  'psv-eindhoven': 'psv', 'feyenoord-rotterdam': 'feyenoord', 'for-sittard': 'fortuna-sittard', 'nijmegen': 'nec-nijmegen',
  'sp-lisbon': 'sporting-cp', 'sporting-clube-de-portugal': 'sporting-cp', 'sport-lisboa-e-benfica': 'benfica',
  'sp-braga': 'sporting-braga', 'sporting-clube-de-braga': 'sporting-braga', 'guimaraes': 'vitoria-guimaraes',
  'pacos-ferreira': 'pacos-de-ferreira',
  // Rest of Europe (UCL sources disagree on transliteration)
  'aek-athen': 'aek-athens', 'olympiacos': 'olympiakos-piraeus', 'olympiakos': 'olympiakos-piraeus',
  'legia-warszawa': 'legia-warsaw', 'sheriff': 'sheriff-tiraspol', 'ferencvarosi-tc': 'ferencvaros',
  'red-bull-salzburg': 'salzburg', 'rb-salzburg': 'salzburg', 'basel-1893': 'basel', 'zenit-st-petersburg': 'zenit',
  'shakhtar-donetsk': 'shakhtar-donetsk', 'crvena-zvezda': 'crvena-zvezda', 'partizan-belgrade': 'partizan',
  'qarabag-agdam': 'qarabag', 'dinamo-kiev': 'dynamo-kyiv', 'club-brugge-kv': 'club-brugge', 'krc-genk': 'genk',
  'rsc-anderlecht': 'anderlecht', 'apoel-nikosia': 'apoel', 'bsc-young-boys': 'young-boys',
};

/** Club-form prefixes/suffixes that carry no identity ("FC Porto" = "Porto"). */
const AFFIXES = new Set(['fc', 'afc', 'cf', 'ac', 'acf', 'as', 'ssc', 'sc', 'sl', 'sk', 'fk', 'nk', 'bk', 'kv', 'cd',
  'ud', 'rc', 'pfc', 'gnk', 'pae', 'sfp', 'sv', 'aj', 'sk']);

/** Letters NFD doesn't decompose ("København", "Bodø", "Łódź") → ASCII, so they
 * don't collapse to a dash in normalizeEntityKey. */
const TRANSLIT: Record<string, string> = { ø: 'o', Ø: 'O', æ: 'ae', Æ: 'Ae', ß: 'ss', ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', ı: 'i', þ: 'th', ð: 'd' };
const translit = (s: string) => s.replace(/[øØæÆßłŁđĐıþð]/g, c => TRANSLIT[c]!);
const keyOfRaw = (raw: string) => stripAffixes(normalizeEntityKey(translit(raw)));

function stripAffixes(key: string): string {
  const parts = key.split('-').filter(p => !/^(18|19)\d\d$/.test(p));
  while (parts.length > 1 && AFFIXES.has(parts[0]!)) parts.shift();
  while (parts.length > 1 && AFFIXES.has(parts[parts.length - 1]!)) parts.pop();
  return parts.join('-');
}

/** Every key a label is known by: Footshorts lookup slugs, their affix-stripped
 * forms, and HISTORY_ALIASES hops from any of them. Two labels sharing one key are
 * the same club. */
function keysFor(raw: string): string[] {
  const out = new Set<string>();
  for (const k of teamLookupSlugs(translit(raw))) { out.add(k); out.add(stripAffixes(k)); }
  for (const k of [...out]) { const a = HISTORY_ALIASES[k]; if (a) out.add(a); }
  return [...out];
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

/** 0–1: best of edit-distance ratio and token overlap, on affix-stripped keys. */
function similarity(a: string, b: string): number {
  const ratio = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const ta = new Set(a.split('-').filter(t => t.length > 2)), tb = new Set(b.split('-').filter(t => t.length > 2));
  if (!ta.size || !tb.size) return ratio;
  const overlap = [...ta].filter(t => tb.has(t)).length / Math.min(ta.size, tb.size);
  return Math.max(ratio, overlap * 0.9);
}

type Label = { source: Source; raw: string; country: string; matches: number; first: string; last: string };
type Entity = { slug: string; name: string; keys: string[] };

async function loadEntities(offline: boolean): Promise<Entity[]> {
  if (offline) return [];
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: teams, error } = await sb.from('entities').select('id, slug, name, fifa_code').eq('type', 'team');
  if (error) throw new Error(`entities: ${error.message}`);
  const { data: aliases, error: aliasError } = await sb.from('entity_aliases').select('alias_slug, entity_id').eq('entity_type', 'team');
  if (aliasError) throw new Error(`entity_aliases: ${aliasError.message}`);
  return (teams ?? []).filter(t => !t.fifa_code).map(t => {
    const keys = new Set([...keysFor(t.slug), ...keysFor(t.name)]);
    for (const a of aliases ?? []) if (a.entity_id === t.id) for (const k of keysFor(a.alias_slug)) keys.add(k);
    return { slug: t.slug, name: t.name, keys: [...keys] };
  });
}

function collectLabels(dir: string): Label[] {
  // Country per (source, raw name): league for football-data, the UCL files' own codes otherwise.
  const country = new Map<string, string>();
  const [h, ...rows] = parseCsv(readFileSync(join(dir, 'raw/ucl/engsoccerdata/champs.csv'), 'utf8'));
  const ix = (c: string) => h!.indexOf(c);
  for (const r of rows) {
    country.set(`engsoccerdata|${r[ix('home')]}`, r[ix('hcountry')]!);
    country.set(`engsoccerdata|${r[ix('visitor')]}`, r[ix('vcountry')]!);
  }
  const ofDir = join(dir, 'raw/ucl/openfootball');
  for (const f of readdirSync(ofDir)) {
    // "team1": "BSC Young Boys (SUI)" in json; "20:45  FC Basel 1893 (SUI)  v  PFC … (BUL)" in txt.
    for (const m of readFileSync(join(ofDir, f), 'utf8').matchAll(/([A-Za-zÀ-ž0-9.'\/&-][^"()\n]*?)\s*\(([A-Z]{3})\)/g)) {
      const name = m[1]!.split(/\s{2,}|\bv\s+|\d{1,2}[:.]\d\d\s+|[-–]\s+/).pop()!.trim();
      country.set(`openfootball|${name}`, m[2]!);
    }
  }

  const [header, ...body] = parseCsv(readFileSync(join(dir, 'data/matches.csv'), 'utf8')).filter(r => r.length > 1);
  const col = (c: string) => header!.indexOf(c);
  const labels = new Map<string, Label>();
  for (const r of body) {
    const src = r[col('source')]!.startsWith('openfootball') ? 'openfootball' : r[col('source')]!;
    if (!(SOURCES as readonly string[]).includes(src)) continue;
    const comp = r[col('competition')]!, season = r[col('season')]!;
    for (const raw of [r[col('home')]!, r[col('away')]!]) {
      const id = `${src}|${raw}`;
      const l = labels.get(id) ?? { source: src as Source, raw, country: '', matches: 0, first: season, last: season };
      l.country ||= LEAGUE_COUNTRY[comp] ?? country.get(id) ?? '';
      l.matches++;
      if (season < l.first) l.first = season;
      if (season > l.last) l.last = season;
      labels.set(id, l);
    }
  }
  for (const l of labels.values()) l.country = COUNTRY_FOLD[l.country] ?? l.country;
  return [...labels.values()];
}

function loadOverrides(dir: string): Map<string, string> {
  const file = join(dir, 'data/teams_overrides.csv');
  const out = new Map<string, string>();
  if (!existsSync(file)) {
    writeFileSync(file, toCsv([['source', 'raw_name', 'canonical_id', 'note']]));
    return out;
  }
  const [h, ...rows] = parseCsv(readFileSync(file, 'utf8')).filter(r => r.length > 1);
  for (const r of rows) {
    const o = Object.fromEntries(h!.map((k, i) => [k, r[i] ?? '']));
    if (o.source && o.raw_name && o.canonical_id) out.set(`${o.source}|${o.raw_name}`, o.canonical_id);
  }
  return out;
}

/** Distinct (ClubElo name, country) pairs across every downloaded snapshot, minus
 * reserve sides ("Real Madrid B", "Jong Ajax", "Juventus U23"). Same names recur
 * across countries (Everton ENG/CHI), so the pair is the key. */
const RESERVE = /(^jong\s)|\s(b|ii|u2[13])$/i;
const NOT_RESERVE = new Set(['Willem II']);
function loadClubElo(dir: string): [string, string][] {
  const out = new Map<string, [string, string]>();
  if (!existsSync(dir)) return [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.csv')).sort()) {
    const [h, ...rows] = parseCsv(readFileSync(join(dir, f), 'utf8')).filter(r => r.length > 1);
    const club = h!.indexOf('Club'), country = h!.indexOf('Country');
    for (const r of rows) {
      const name = r[club]!.trim(), c = COUNTRY_FOLD[r[country]!] ?? r[country]!;
      if (name && (NOT_RESERVE.has(name) || !RESERVE.test(name))) out.set(`${name}|${c}`, [name, c]);
    }
  }
  return [...out.values()];
}

/** A club in the making: labels + at most one Footshorts entity + at most one pinned id. */
type Group = { labels: Label[]; entity?: Entity; pinned?: string; countries: Set<string>; notes: string[] };

async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== '--');
  if (!args.every(a => a === '--offline' || a.startsWith('--dir=') || a.startsWith('--clubelo-dir='))) {
    throw new Error('Usage: history:teams -- [--dir=path] [--clubelo-dir=path] [--offline]');
  }
  const dir = resolve(args.find(a => a.startsWith('--dir='))?.slice(6) ?? DEFAULT_DIR);
  const clubeloDir = resolve(args.find(a => a.startsWith('--clubelo-dir='))?.slice(14) ?? join(dir, 'raw/clubelo'));

  const labels = collectLabels(dir);
  const overrides = loadOverrides(dir);
  const entities = await loadEntities(args.includes('--offline'));

  // Union-find over groups. A merge is refused (and noted) when it would put two
  // countries, two Footshorts entities or two pinned ids in one club.
  const parent = new Map<Group, Group>();
  const find = (g: Group): Group => { let r = g; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(g, r); return r; };
  const make = (g: Group) => { parent.set(g, g); return g; };
  const conflict = (a: Group, b: Group): string | null => {
    if (a.countries.size && b.countries.size && ![...a.countries].some(c => b.countries.has(c))) return 'country';
    if (a.entity && b.entity && a.entity !== b.entity) return 'entity';
    if (a.pinned && b.pinned && a.pinned !== b.pinned) return 'override';
    return null;
  };
  const union = (x: Group, y: Group, why: string): boolean => {
    const a = find(x), b = find(y);
    if (a === b) return true;
    const c = conflict(a, b);
    if (c) {
      a.notes.push(`not merged with "${(b.labels[0]?.raw ?? b.entity?.name)}" (${why}; ${c} differs)`);
      return false;
    }
    parent.set(b, a);
    a.labels.push(...b.labels);
    a.entity ??= b.entity;
    a.pinned ??= b.pinned;
    for (const c2 of b.countries) a.countries.add(c2);
    a.notes.push(...b.notes);
    return true;
  };

  const labelGroups = labels.map(l => make({ labels: [l], countries: new Set(l.country ? [l.country] : []), notes: [],
    pinned: overrides.get(`${l.source}|${l.raw}`) }));
  const entityGroups = entities.map(e => make({ labels: [], entity: e, countries: new Set(), notes: [] }));

  // Pass 1: overrides, then shared keys (entity keys registered first so a label
  // that matches an entity attaches to it rather than to a sibling label).
  const byPin = new Map<string, Group>();
  for (const g of labelGroups) if (g.pinned) { const o = byPin.get(g.pinned); if (o) union(o, g, 'override'); else byPin.set(g.pinned, g); }
  for (const g of entityGroups) { const o = byPin.get(g.entity!.slug); if (o) union(o, g, 'override'); }
  const byKey = new Map<string, Group>();
  for (const g of entityGroups) for (const k of g.entity!.keys) if (!byKey.has(k)) byKey.set(k, g);
  for (const g of labelGroups) {
    if (g.pinned) continue;
    for (const k of keysFor(g.labels[0]!.raw)) {
      const o = byKey.get(k);
      if (o) union(o, g, `key ${k}`); else byKey.set(k, g);
    }
  }

  // Pass 2: fuzzy. A group only one source knows (and that no entity claimed) snaps
  // to the most similar same-country group another source knows: ≥0.88 merges and
  // is flagged for review, 0.6–0.88 is only suggested.
  const roots = () => [...new Set(labelGroups.map(find))];
  const keyOf = (g: Group) => keyOfRaw(g.labels[0]!.raw);
  const sourcesOf = (g: Group) => new Set(g.labels.map(l => l.source));
  for (const g of roots()) {
    if (find(g) !== g || g.entity || g.pinned || sourcesOf(g).size > 1) continue;
    const mine = sourcesOf(g);
    let best: { g: Group; score: number } | null = null;
    for (const o of roots()) {
      if (o === g || [...sourcesOf(o)].some(s => mine.has(s)) || conflict(g, o)) continue;
      if (!g.countries.size || !o.countries.size) continue;
      const s = Math.max(...o.labels.map(l => similarity(keyOf(g), keyOfRaw(l.raw))));
      if (!best || s > best.score) best = { g: o, score: s };
    }
    if (!best || best.score < 0.6) continue;
    const other = best.g.entity?.slug ?? best.g.labels[0]!.raw;
    if (best.score >= 0.88) {
      const target = find(best.g);
      if (union(target, g, 'fuzzy')) target.notes.push(`fuzzy: "${g.labels[0]!.raw}" ≈ "${other}" (${best.score.toFixed(2)})`);
    } else g.notes.push(`maybe same as "${other}" (${best.score.toFixed(2)})`);
  }

  // One row per club. canonical_id: pinned > Footshorts entity slug > the
  // football-data name's key > openfootball's > engsoccerdata's.
  const header = ['canonical_id', 'canonical_name', 'country', 'footshorts_entity', ...SOURCES.map(s => SOURCE_COLUMN[s]),
    'clubelo_name', 'transfermarkt_name', 'first_season', 'last_season', 'matches', 'needs_review', 'review_note'];
  const clubs: { g: Group; id: string; clubelo: Set<string> }[] = [];
  const seen = new Set<string>();
  for (const g of roots()) {
    const byRank = [...g.labels].sort((a, b) => SOURCES.indexOf(a.source) - SOURCES.indexOf(b.source));
    let id = g.pinned ?? g.entity?.slug ?? keyOfRaw(byRank[0]!.raw);
    if (seen.has(id)) { g.notes.push(`id collided with another club; renamed`); id = `${id}-${[...g.countries][0]?.toLowerCase() ?? 'x'}`; }
    seen.add(id);
    clubs.push({ g, id, clubelo: new Set() });
  }

  // Pass 3: attach ClubElo names within the same country — overrides, then shared
  // keys for every name, and only then fuzzy for clubs still without one. ClubElo
  // uses short forms ("Brugge", "Legia"), so its fuzzy test is containment: every
  // word of the ClubElo name must appear in ours ("München 60" ≠ "Bayern München").
  const clubelo = loadClubElo(clubeloDir);
  // Transfermarkt names come from scripts/players.py tm-clubs, which pairs clubs by
  // matching games against these very ids — so they're attached by id, not by name.
  const tmFile = join(dir, 'data/transfermarkt_clubs.csv');
  const tmNames = new Map<string, string[]>();
  if (existsSync(tmFile)) {
    const [h, ...rows] = parseCsv(readFileSync(tmFile, 'utf8')).filter(r => r.length > 1);
    const id = h!.indexOf('canonical_id'), name = h!.indexOf('tm_name');
    for (const r of rows) (tmNames.get(r[id]!) ?? tmNames.set(r[id]!, []).get(r[id]!)!).push(r[name]!);
  }
  const byId = new Map(clubs.map(c => [c.id, c]));
  const keysOf = new Map(clubs.map(c => [c, new Set([...c.g.labels.flatMap(l => keysFor(l.raw)), ...(c.g.entity?.keys ?? [])])]));
  const words = (s: string) => new Set(keyOfRaw(s).split('-'));
  let clubeloAttached = 0;
  const pending: [string, string][] = [];
  for (const [name, country] of clubelo) {
    const pinned = overrides.get(`clubelo|${name}`);
    if (pinned === '-') continue; // reviewed: no club of ours
    const keys = keysFor(name);
    const hit = pinned ? byId.get(pinned)
      : clubs.find(c => c.g.countries.has(country) && keys.some(k => keysOf.get(c)!.has(k)));
    if (hit) { hit.clubelo.add(name); clubeloAttached++; } else if (!pinned) pending.push([name, country]);
  }
  for (const [name, country] of pending) {
    const mine = words(name);
    let best: { c: (typeof clubs)[number]; score: number } | null = null;
    for (const c of clubs) {
      if (c.clubelo.size || !c.g.countries.has(country)) continue;
      const score = Math.max(...c.g.labels.map(l => {
        const theirs = words(l.raw);
        const contained = [...mine].every(w => theirs.has(w)) ? 0.9 : 0;
        return Math.max(contained, 1 - levenshtein(keyOfRaw(name), keyOfRaw(l.raw)) / Math.max(keyOfRaw(name).length, keyOfRaw(l.raw).length));
      }));
      if (!best || score > best.score) best = { c, score };
    }
    if (best && best.score >= 0.88) {
      best.c.clubelo.add(name); clubeloAttached++;
      // Containment hits ("Legia" ⊂ "Legia Warszawa") checked out across the board; flag only edit-distance ones.
      if (best.score !== 0.9) best.c.g.notes.push(`clubelo fuzzy: "${name}" (${best.score.toFixed(2)})`);
    } else if (best && best.score >= 0.75) best.c.g.notes.push(`clubelo maybe "${name}" (${best.score.toFixed(2)})`);
  }
  for (const c of clubs) if (c.clubelo.size > 1) c.g.notes.push(`several ClubElo names`);

  const out: string[][] = [];
  for (const { g, id, clubelo: eloNames } of clubs) {
    const byRank = [...g.labels].sort((a, b) => SOURCES.indexOf(a.source) - SOURCES.indexOf(b.source));
    const names = (s: Source) => [...new Set(g.labels.filter(l => l.source === s).map(l => l.raw))].join(' | ');
    const name = g.entity?.name ?? g.labels.find(l => l.source === 'openfootball')?.raw ?? byRank.at(-1)!.raw;
    const notes = [...new Set(g.notes)];
    if (g.countries.size > 1) notes.push(`countries: ${[...g.countries].join('/')}`);
    out.push([id, name, [...g.countries].join('/'), g.entity?.slug ?? '', ...SOURCES.map(names), [...eloNames].join(' | '), (tmNames.get(id) ?? []).join(' | '),
      g.labels.map(l => l.first).sort()[0]!, g.labels.map(l => l.last).sort().at(-1)!,
      String(g.labels.reduce((n, l) => n + l.matches, 0)), notes.length ? 'yes' : '', notes.join('; ')]);
  }
  const rev = header.indexOf('needs_review');
  out.sort((a, b) => Number(b[rev] === 'yes') - Number(a[rev] === 'yes') || a[2]!.localeCompare(b[2]!) || a[0]!.localeCompare(b[0]!));
  writeFileSync(join(dir, 'data/teams.csv'), toCsv([header, ...out]));

  const count = (f: (r: string[]) => boolean) => out.filter(f).length;
  console.log(JSON.stringify({
    labels: labels.length, clubs: out.length,
    linkedToFootshorts: count(r => !!r[3]),
    leagueAndUcl: count(r => !!r[4] && !!(r[5] || r[6])),
    needsReview: count(r => r[rev] === 'yes'),
    clubeloNames: clubelo.length, clubeloAttached,
    leagueClubsWithoutClubElo: clubelo.length ? count(r => !!r[4] && !r[7]) : undefined,
    overrides: overrides.size,
    wrote: join(dir, 'data/teams.csv'),
  }));
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Crosswalk failed'); process.exitCode = 1; });
