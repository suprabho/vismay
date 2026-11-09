import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchEspnMatch, type EspnCompetitionRef, type EspnMatchDetail } from './espnMatch';

// ESPN fallback for LEAGUE fixtures whose Opta match facts are missing (the
// theanalyst.com scrape has been behind a Cloudflare challenge since
// 2026-11-08). Same private boundary as the cup import (./espnCups): the
// detail lives in its own admin-only table keyed by our fixture id. It is
// never written to fixtures, fixture_events, opta_match_facts,
// opta_match_stories, share cards or any consumer feed; the admin Match facts
// tab and the admin HTML-stories brief read it through the service role.
export const ESPN_LEAGUE_MATCH_TABLE = 'admin_espn_league_matches';
/** One-row on/off switch for the automatic fallback (admin Match facts tab). */
export const ESPN_FALLBACK_SETTINGS_TABLE = 'admin_espn_fallback_settings';

export interface EspnLeague extends EspnCompetitionRef {
  /** Our fixtures.competition_slug. */
  slug: string;
  /** ESPN's league slug, as its scoreboard and summary URLs take it. */
  code: string;
  name: string;
}

// Every code verified against ESPN's scoreboard 2026-11-09. A league only
// costs requests when it has finished fixtures missing Opta facts.
export const ESPN_LEAGUES: readonly EspnLeague[] = [
  { slug: 'premier-league', code: 'eng.1', name: 'Premier League' },
  { slug: 'primera-division', code: 'esp.1', name: 'LaLiga' },
  { slug: 'serie-a', code: 'ita.1', name: 'Serie A' },
  { slug: 'bundesliga', code: 'ger.1', name: 'Bundesliga' },
  { slug: 'ligue-1', code: 'fra.1', name: 'Ligue 1' },
  { slug: 'champions-league', code: 'uefa.champions', name: 'Champions League' },
  { slug: 'championship', code: 'eng.2', name: 'Championship' },
  { slug: 'europa-league', code: 'uefa.europa', name: 'Europa League' },
  { slug: 'conference-league', code: 'uefa.europa.conf', name: 'Conference League' },
  { slug: 'eredivisie', code: 'ned.1', name: 'Eredivisie' },
  { slug: 'primeira-liga', code: 'por.1', name: 'Primeira Liga' },
];

export function espnLeagueBySlug(slug: string | null | undefined): EspnLeague | null {
  return ESPN_LEAGUES.find(l => l.slug === slug) ?? null;
}

export function espnLeagueByCode(code: string | null | undefined): EspnLeague | null {
  return ESPN_LEAGUES.find(l => l.code === code) ?? null;
}

/**
 * The ESPN event id in a pasted ESPN match link, any edition and page:
 * `espn.in/football/match/_/gameId/401882816/barcelona-atletico-madrid`,
 * `espn.com/soccer/matchstats/_/gameId/401882816`, `…/commentary?gameId=…`.
 * Null for anything that is not an ESPN host or carries no numeric gameId.
 */
export function parseEspnMatchUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  // espn.com, espn.in, espn.co.uk, espn.com.au, africa.espn.com, espnfc.com…
  if (!/(^|\.)espn(fc)?\.[a-z]{2,3}(\.[a-z]{2})?$/i.test(url.hostname)) return null;
  const fromPath = /\/gameId\/(\d+)(?:\/|$)/.exec(url.pathname)?.[1];
  const fromQuery = url.searchParams.get('gameId');
  const id = fromPath ?? (fromQuery && /^\d+$/.test(fromQuery) ? fromQuery : null);
  return id ?? null;
}

/** True when the link is an ESPN match link (the match_url input takes both kinds). */
export function isEspnMatchUrl(raw: string): boolean {
  return parseEspnMatchUrl(raw) != null;
}

/** One finished-or-not match off an ESPN league scoreboard. */
export interface EspnScoreboardMatch {
  espn_event_id: string;
  league_code: string;
  kickoff_at: string;
  home_team_name: string;
  away_team_name: string;
  completed: boolean;
}

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** A scoreboard payload → its matches. Skips events without two named sides
 * or a parseable date; throws when the payload is for another league. */
export function parseEspnScoreboard(payload: unknown, league: EspnCompetitionRef): EspnScoreboardMatch[] {
  const p = object(payload);
  if (!Array.isArray(p.events)) throw new Error(`ESPN ${league.code} scoreboard: missing events list`);
  const sent = text(object(list(p.leagues)[0]).slug);
  if (sent && sent !== league.code) throw new Error(`ESPN ${league.code} scoreboard: got ${sent} instead`);
  const out: EspnScoreboardMatch[] = [];
  for (const raw of p.events) {
    const e = object(raw);
    const id = text(e.id);
    const match = object(list(e.competitions)[0]);
    const sides = list(match.competitors).map(object);
    const home = sides.find(s => s.homeAway === 'home');
    const away = sides.find(s => s.homeAway === 'away');
    const kickoff = text(match.date) ?? text(e.date);
    if (!id || !/^\d+$/.test(id) || !home || !away || !kickoff || !Number.isFinite(Date.parse(kickoff))) continue;
    const homeName = text(object(home.team).displayName) ?? text(object(home.team).name);
    const awayName = text(object(away.team).displayName) ?? text(object(away.team).name);
    if (!homeName || !awayName) continue;
    const type = object(object(match.status ?? e.status).type);
    out.push({
      espn_event_id: id,
      league_code: league.code,
      kickoff_at: new Date(kickoff).toISOString(),
      home_team_name: homeName,
      away_team_name: awayName,
      completed: type.completed === true,
    });
  }
  return out;
}

/** `YYYYMM` months to ask ESPN for so every kickoff is covered. ESPN rejects
 * `dates=` ranges but takes a whole month; its days follow US Eastern time,
 * so the day before each kickoff is covered too (a 00:30 UTC kickoff on the
 * 1st sits in the previous month there). */
export function scoreboardMonths(kickoffs: string[]): string[] {
  const months = new Set<string>();
  for (const k of kickoffs) {
    const t = Date.parse(k);
    if (!Number.isFinite(t)) continue;
    for (const d of [new Date(t), new Date(t - 86_400_000)]) {
      months.add(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }
  }
  return [...months].sort();
}

export async function fetchEspnScoreboardMonth(
  league: EspnCompetitionRef,
  yyyymm: string,
  fetcher: typeof fetch = fetch
): Promise<EspnScoreboardMatch[]> {
  if (!/^\d{6}$/.test(yyyymm)) throw new Error(`Invalid scoreboard month ${yyyymm}`);
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.code}/scoreboard?dates=${yyyymm}&limit=1000`;
  const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`ESPN ${league.code} scoreboard ${yyyymm}: HTTP ${response.status}`);
  const payload = await response.json();
  const events = list(object(payload).events);
  if (events.length >= 1000) throw new Error(`ESPN ${league.code} scoreboard ${yyyymm}: response may be truncated`);
  return parseEspnScoreboard(payload, league);
}

/** The league a summary payload says the match belongs to (`header.league.slug`). */
export function summaryLeagueCode(summary: unknown): string | null {
  return text(object(object(object(summary).header).league).slug);
}

export interface StoredEspnLeagueMatch {
  fixture_id: string;
  espn_event_id: string;
  espn_league_code: string;
  competition_slug: string;
  detail: EspnMatchDetail;
  raw_payload: unknown;
  event_count: number;
  has_team_stats: boolean;
  fetched_at: string;
}

export function toStoredEspnLeagueMatch(
  fixtureId: string,
  league: EspnCompetitionRef,
  detail: EspnMatchDetail,
  raw: unknown
): StoredEspnLeagueMatch {
  return {
    fixture_id: fixtureId,
    espn_event_id: detail.espn_event_id,
    espn_league_code: league.code,
    competition_slug: league.slug,
    detail,
    raw_payload: raw,
    event_count: detail.events.length,
    has_team_stats: detail.facts != null,
    fetched_at: detail.fetched_at,
  };
}

/** Fetch one ESPN match and store it against our fixture (upsert on fixture_id). */
export async function extractEspnLeagueMatch(
  sb: SupabaseClient,
  fixtureId: string,
  league: EspnCompetitionRef,
  eventId: string,
  fetcher: typeof fetch = fetch
): Promise<StoredEspnLeagueMatch> {
  const { detail, raw } = await fetchEspnMatch(league, eventId, fetcher);
  const row = toStoredEspnLeagueMatch(fixtureId, league, detail, raw);
  await saveEspnLeagueMatch(sb, row);
  return row;
}

export async function saveEspnLeagueMatch(sb: SupabaseClient, row: StoredEspnLeagueMatch): Promise<void> {
  const { error } = await sb.from(ESPN_LEAGUE_MATCH_TABLE).upsert(row, { onConflict: 'fixture_id' });
  if (error) {
    throw new Error(
      `ESPN match ${row.espn_event_id} could not be saved for fixture ${row.fixture_id}: ${error.message}` +
        (/unique|duplicate/i.test(error.message) ? ' (another fixture already holds this ESPN match)' : '')
    );
  }
}

export interface EspnFallbackSetting {
  enabled: boolean;
  /** False when the settings table is missing (migration not applied). */
  available: boolean;
  updated_at: string | null;
  updated_by: string | null;
  error?: string;
}

/** The admin on/off switch. A missing table or row reads as OFF, so the
 * fallback never runs before its migration (and private table) exist. */
export async function readEspnFallbackSetting(sb: SupabaseClient): Promise<EspnFallbackSetting> {
  const { data, error } = await sb
    .from(ESPN_FALLBACK_SETTINGS_TABLE)
    .select('enabled, updated_at, updated_by')
    .eq('id', true)
    .maybeSingle();
  if (error) return { enabled: false, available: false, updated_at: null, updated_by: null, error: error.message };
  const row = data as { enabled: boolean; updated_at: string | null; updated_by: string | null } | null;
  return { enabled: row?.enabled === true, available: true, updated_at: row?.updated_at ?? null, updated_by: row?.updated_by ?? null };
}

export async function writeEspnFallbackSetting(sb: SupabaseClient, enabled: boolean, updatedBy: string | null): Promise<void> {
  const { error } = await sb
    .from(ESPN_FALLBACK_SETTINGS_TABLE)
    .upsert({ id: true, enabled, updated_at: new Date().toISOString(), updated_by: updatedBy }, { onConflict: 'id' });
  if (error) throw new Error(`ESPN fallback setting could not be saved: ${error.message}`);
}
