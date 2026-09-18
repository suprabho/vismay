import type { SupabaseClient } from '@supabase/supabase-js';

// This import has its own private storage. Never write these rows to fixtures,
// entities, or any of the consumer-facing match-facts / publishing tables.
export const ESPN_CUP_TABLE = 'admin_espn_cup_fixtures';
export const ESPN_CUPS = [
  { slug: 'fa-cup', code: 'eng.fa', name: 'FA Cup' },
  { slug: 'efl-cup', code: 'eng.league_cup', name: 'Carabao Cup' },
  { slug: 'copa-del-rey', code: 'esp.copa_del_rey', name: 'Copa del Rey' },
  { slug: 'dfb-pokal', code: 'ger.dfb_pokal', name: 'DFB-Pokal' },
  { slug: 'coppa-italia', code: 'ita.coppa_italia', name: 'Coppa Italia' },
  { slug: 'coupe-de-france', code: 'fra.coupe_de_france', name: 'Coupe de France' },
] as const;
export type EspnCup = (typeof ESPN_CUPS)[number];
export type CupStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled' | 'suspended' | 'unknown';

export interface CupFixture {
  espn_event_id: string;
  competition_slug: string;
  espn_competition_code: string;
  season_start: number;
  round_label: string | null;
  kickoff_at: string | null;
  kickoff_time_confirmed: boolean;
  status: CupStatus;
  status_detail: string | null;
  home_espn_id: string | null;
  away_espn_id: string | null;
  home_team_name: string;
  away_team_name: string;
  home_score: number | null;
  away_score: number | null;
  home_penalties: number | null;
  away_penalties: number | null;
  winner_espn_id: string | null;
  venue: string | null;
  notes: string[];
  source_url: string;
  fetched_at: string;
}
export type StoredCupFixture = CupFixture & { raw_payload: unknown };

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function score(value: unknown): number | null {
  if (value == null || (typeof value === 'string' && !value.trim()) || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}
export function currentCupSeason(now = new Date()): number {
  return now.getUTCFullYear() - (now.getUTCMonth() < 6 ? 1 : 0);
}
export function cupSeasonLabel(year: number): string {
  return `${year}/${String(year + 1).slice(-2)}`;
}
export function validCupSeason(year: unknown): year is number {
  return typeof year === 'number' && Number.isInteger(year) && year >= 2000 && year <= currentCupSeason() + 1;
}

function normalizeStatus(type: JsonObject): CupStatus {
  const name = text(type.name) ?? '';
  if (/POSTPON/i.test(name)) return 'postponed';
  if (/CANCEL|ABANDON/i.test(name)) return 'cancelled';
  if (/SUSPEND/i.test(name)) return 'suspended';
  if (type.completed === true) return 'finished';
  if (type.state === 'in') return 'live';
  if (type.state === 'pre') return 'scheduled';
  return 'unknown';
}

/** ESPN's event.season.year is the START year, even for a spring final.
 * Calendar-year scoreboards mix two campaigns; never infer the season from
 * the response's leagues[0].season (which describes the current campaign). */
export function normalizeCupEvent(event: unknown, cup: EspnCup, fetchedAt: string): StoredCupFixture {
  const e = object(event);
  const id = text(e.id);
  const season = object(e.season).year;
  if (!id || !/^\d+$/.test(id) || !validCupSeason(season)) throw new Error('ESPN event has no valid ID or season');
  const competitions = Array.isArray(e.competitions) ? e.competitions : [];
  if (competitions.length !== 1) throw new Error(`ESPN event ${id}: expected one match`);
  const match = object(competitions[0]);
  const sides = (Array.isArray(match.competitors) ? match.competitors : []).map(object);
  const home = sides.find(s => s.homeAway === 'home');
  const away = sides.find(s => s.homeAway === 'away');
  if (!home || !away) throw new Error(`ESPN event ${id}: missing home or away side`);
  const homeTeam = object(home.team);
  const awayTeam = object(away.team);
  const type = object(object(match.status ?? e.status).type);
  const status = normalizeStatus(type);
  // ESPN sends score="0" for unplayed games; do not manufacture a 0–0 result.
  const hasScores = status === 'live' || status === 'finished' || status === 'suspended';
  const kickoff = text(match.date) ?? text(e.date);
  if (kickoff && !Number.isFinite(Date.parse(kickoff))) throw new Error(`ESPN event ${id}: invalid kickoff`);
  const stage = text(object(e.season).slug)?.replace(/-/g, ' ');
  return {
    espn_event_id: id,
    competition_slug: cup.slug,
    espn_competition_code: cup.code,
    season_start: season,
    round_label: text(object(match.series).title) ?? stage ?? text(match.altGameNote),
    kickoff_at: kickoff ? new Date(kickoff).toISOString() : null,
    kickoff_time_confirmed: !!kickoff && match.timeValid === true,
    status,
    status_detail: text(type.description),
    home_espn_id: text(homeTeam.id) ?? text(home.id),
    away_espn_id: text(awayTeam.id) ?? text(away.id),
    home_team_name: text(homeTeam.displayName) ?? text(homeTeam.name) ?? 'TBD',
    away_team_name: text(awayTeam.displayName) ?? text(awayTeam.name) ?? 'TBD',
    home_score: hasScores ? score(home.score) : null,
    away_score: hasScores ? score(away.score) : null,
    home_penalties: hasScores ? score(home.shootoutScore) : null,
    away_penalties: hasScores ? score(away.shootoutScore) : null,
    winner_espn_id: status === 'finished'
      ? (home.winner === true ? text(homeTeam.id) : away.winner === true ? text(awayTeam.id) : null)
      : null,
    venue: text(object(match.venue).fullName),
    notes: (Array.isArray(match.notes) ? match.notes : []).flatMap(n => {
      const note = text(object(n).text);
      return note ? [note] : [];
    }),
    source_url: `https://www.espn.com/soccer/match/_/gameId/${id}`,
    fetched_at: fetchedAt,
    raw_payload: event,
  };
}

/** Fetch both calendar years, then select the event's campaign. ESPN rejects
 * the cross-year dates range for these cups. An empty valid response is not
 * proof of complete coverage; never delete stored matches on a refresh. */
export async function fetchEspnCup(cup: EspnCup, season: number, fetcher: typeof fetch = fetch): Promise<StoredCupFixture[]> {
  if (!validCupSeason(season)) throw new Error('Invalid season start year');
  const fetchedAt = new Date().toISOString();
  const pages = await Promise.all([season, season + 1].map(async year => {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${cup.code}/scoreboard?dates=${year}&limit=1000`;
    const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`ESPN ${cup.name} ${year}: HTTP ${response.status}`);
    const payload = object(await response.json());
    if (!Array.isArray(payload.events)) throw new Error(`ESPN ${cup.name} ${year}: missing events list`);
    if (payload.events.length >= 1000) throw new Error(`ESPN ${cup.name} ${year}: response may be truncated`);
    const league = object(Array.isArray(payload.leagues) ? payload.leagues[0] : null);
    if (league.slug !== cup.code) throw new Error(`ESPN ${cup.name}: unexpected competition`);
    return payload.events;
  }));
  const rows = new Map<string, StoredCupFixture>();
  for (const event of pages.flat()) {
    const year = object(object(event).season).year;
    if (!validCupSeason(year)) throw new Error(`ESPN ${cup.name}: event missing season`);
    if (year !== season) continue;
    const row = normalizeCupEvent(event, cup, fetchedAt);
    rows.set(row.espn_event_id, row);
  }
  return [...rows.values()].sort((a, b) => (a.kickoff_at ?? '').localeCompare(b.kickoff_at ?? ''));
}

export async function importEspnCup(sb: SupabaseClient, cup: EspnCup, season: number) {
  const rows = await fetchEspnCup(cup, season);
  if (rows.length) {
    const { error } = await sb.from(ESPN_CUP_TABLE).upsert(rows, { onConflict: 'espn_event_id' });
    if (error) throw new Error(`Cup import could not be saved: ${error.message}`);
  }
  return {
    competition: cup.slug,
    season,
    imported: rows.length,
    finished: rows.filter(r => r.status === 'finished').length,
    scheduled: rows.filter(r => r.status === 'scheduled').length,
  };
}
