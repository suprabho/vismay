import type { SupabaseClient } from '@supabase/supabase-js';
import { ESPN_CUP_TABLE, type CupFixture, type EspnCup } from './espnCups';

// ESPN match detail (the data behind espn.com/soccer/match, matchstats,
// lineups and commentary pages) for one imported cup fixture. Stored in its
// own private admin table next to the cup fixtures. Never written to
// fixtures, fixture_events, opta_match_facts or any consumer table: the admin
// share-card studio reads it through admin-only routes instead.
export const ESPN_MATCH_DETAIL_TABLE = 'admin_espn_cup_match_details';

export type EspnTimelineKind =
  | 'goal' | 'own-goal' | 'penalty-goal' | 'penalty-missed'
  | 'yellow-card' | 'red-card' | 'substitution' | 'var' | 'period' | 'other';

export interface EspnTeamSummary {
  espn_id: string | null;
  name: string;
  abbreviation: string | null;
  logo_url: string | null;
  color: string | null;
  score: number | null;
  shootout_score: number | null;
  winner: boolean;
}

/** Every ESPN key event, including period markers and missed penalties, so the
 * admin can read the full match as ESPN reports it. */
export interface EspnTimelineEntry {
  espn_id: string | null;
  kind: EspnTimelineKind;
  label: string;
  minute: number | null;
  extra_minute: number | null;
  period: number | null;
  clock_label: string;
  side: 'home' | 'away' | null;
  team_name: string | null;
  player: string | null;
  /** Assister for goals; the player replaced for substitutions. */
  secondary: string | null;
  text: string;
  scoring_play: boolean;
}

/** The subset of the timeline in the `fixture_events` vocabulary the
 * MatchTimeline renderer expects (goal | card | subst | var + API-Football
 * detail spellings). `fixture_id` is the ESPN event id. */
export interface EspnMatchEvent {
  id: string;
  fixture_id: string;
  team_id: null;
  side: 'home' | 'away' | null;
  minute: number;
  extra_minute: number | null;
  type: 'goal' | 'card' | 'subst' | 'var';
  detail: string | null;
  player_name: string | null;
  assist_name: string | null;
}

export interface EspnSideFacts {
  possession: number | null;
  shots: number | null;
  shots_on_target: number | null;
  corners: number | null;
  fouls: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  offsides: number | null;
  saves: number | null;
  passes: number | null;
  pass_accuracy: number | null;
  /** Every numeric statistic ESPN sent, keyed by its ESPN name. */
  raw_stats: Record<string, number>;
}

/** Counts derived from the timeline. Always available, even when ESPN sends
 * no team statistics for the competition. */
export interface EspnDerivedFacts {
  goals: number;
  yellow_cards: number;
  red_cards: number;
  substitutions: number;
  penalties_scored: number;
  penalties_missed: number;
}

export interface EspnLineupPlayer {
  name: string;
  jersey: string | null;
  position: string | null;
  starter: boolean;
  subbed_in: boolean;
  subbed_out: boolean;
}

export interface EspnLineup {
  formation: string | null;
  starters: EspnLineupPlayer[];
  bench: EspnLineupPlayer[];
}

export interface EspnCommentaryEntry {
  sequence: number;
  clock_label: string;
  text: string;
}

export interface EspnMatchDetail {
  espn_event_id: string;
  competition_slug: string;
  source_url: string;
  fetched_at: string;
  kickoff_at: string | null;
  status: { state: 'pre' | 'in' | 'post' | 'unknown'; description: string | null; detail: string | null; completed: boolean };
  season_name: string | null;
  venue: string | null;
  attendance: number | null;
  referee: string | null;
  home: EspnTeamSummary;
  away: EspnTeamSummary;
  timeline: EspnTimelineEntry[];
  events: EspnMatchEvent[];
  facts: { home: EspnSideFacts; away: EspnSideFacts } | null;
  derived: { home: EspnDerivedFacts; away: EspnDerivedFacts };
  lineups: { home: EspnLineup; away: EspnLineup } | null;
  commentary: EspnCommentaryEntry[];
}

export interface StoredEspnMatchDetail {
  espn_event_id: string;
  competition_slug: string;
  detail: EspnMatchDetail;
  raw_payload: unknown;
  event_count: number;
  has_team_stats: boolean;
  fetched_at: string;
}

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function count(value: unknown): number | null {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}
function numeric(value: unknown): number | null {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** "45'+4'" → 45 + 4; "16'" → 16; "" → null. */
export function parseEspnClock(label: string | null): { minute: number; extra_minute: number | null } | null {
  const m = /^(\d+)'(?:\s*\+\s*(\d+)')?/.exec(label ?? '');
  if (!m) return null;
  return { minute: Number(m[1]), extra_minute: m[2] ? Number(m[2]) : null };
}

export function classifyEspnEvent(typeSlug: string, typeText: string, scoringPlay: boolean): EspnTimelineKind {
  const slug = typeSlug.toLowerCase();
  const label = typeText.toLowerCase();
  if (/own[-\s]?goal/.test(slug) || /own goal/.test(label)) return 'own-goal';
  if (/^penalty/.test(slug) && /scor/.test(slug + label)) return 'penalty-goal';
  if (/^penalty/.test(slug) && /(miss|sav|fail)/.test(slug + label)) return 'penalty-missed';
  if (/^goal/.test(slug) || (scoringPlay && !/shootout/.test(slug))) return 'goal';
  if (/red/.test(slug)) return 'red-card';
  if (/yellow/.test(slug)) return 'yellow-card';
  if (/^sub/.test(slug)) return 'substitution';
  if (/\bvar\b|video/.test(slug + ' ' + label)) return 'var';
  if (/kickoff|halftime|half|extra-time|regular-time|end-match|shootout|delay|start|end/.test(slug)) return 'period';
  return 'other';
}

const PERIOD_MINUTES: Record<string, number> = {
  kickoff: 0, halftime: 45, 'start-2nd-half': 45, 'end-regular-time': 90,
  'start-extra-time': 90, 'halftime-extra-time': 105, 'start-2nd-half-extra-time': 105, 'end-extra-time': 120,
};

function sideOf(team: JsonObject, home: EspnTeamSummary, away: EspnTeamSummary): 'home' | 'away' | null {
  const id = text(team.id);
  const name = text(team.displayName);
  if (id && id === home.espn_id) return 'home';
  if (id && id === away.espn_id) return 'away';
  if (name && name === home.name) return 'home';
  if (name && name === away.name) return 'away';
  return null;
}

function teamSummary(competitor: JsonObject): EspnTeamSummary {
  const team = object(competitor.team);
  const logo = text(object(list(team.logos)[0]).href) ?? text(team.logo);
  const id = text(team.id) ?? text(competitor.id);
  const color = text(team.color);
  return {
    espn_id: id,
    name: text(team.displayName) ?? text(team.name) ?? 'TBD',
    abbreviation: text(team.abbreviation),
    logo_url: logo ?? (id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png` : null),
    color: color ? (color.startsWith('#') ? color : `#${color}`) : null,
    score: count(competitor.score),
    shootout_score: count(competitor.shootoutScore),
    winner: competitor.winner === true,
  };
}

function timelineEntry(raw: unknown, home: EspnTeamSummary, away: EspnTeamSummary): EspnTimelineEntry | null {
  const e = object(raw);
  const type = object(e.type);
  const slug = text(type.type) ?? '';
  const label = text(type.text) ?? slug;
  if (!slug && !label) return null;
  const scoring = e.scoringPlay === true;
  const kind = classifyEspnEvent(slug, label, scoring);
  const clockLabel = text(object(e.clock).displayValue) ?? '';
  const clock = parseEspnClock(clockLabel);
  const period = count(object(e.period).number);
  const body = text(e.text) ?? text(e.shortText) ?? label;
  const participants = list(e.participants).map(p => text(object(object(p).athlete).displayName)).filter((n): n is string => !!n);
  let player: string | null = participants[0] ?? null;
  let secondary: string | null = participants[1] ?? null;
  if (kind === 'substitution' && participants.length < 2) {
    // ESPN lists participants as [on, off]; when they are missing, read the
    // text: "Substitution, Newport County. Joe Thomas replaces Habeeb
    // Ogunneye because of an injury."
    const m = /([^.,]+?)\s+replaces\s+([^.,]+?)(?:\s+(?:because|due|after|following|with)\b[^.]*)?\.?\s*$/.exec(body);
    if (m) { player = m[1]!.trim(); secondary = m[2]!.trim(); }
  } else if (kind === 'goal' || kind === 'penalty-goal' || kind === 'own-goal') {
    const m = /Assisted by ([^.]+?)(?:\s+(?:with|following|after)\b[^.]*)?\.?\s*$/.exec(body);
    if (m && !secondary) secondary = m[1]!.trim();
    if (kind === 'own-goal') secondary = null;
  }
  const team = object(e.team);
  return {
    espn_id: text(e.id),
    kind,
    label,
    minute: clock?.minute ?? (kind === 'period' ? PERIOD_MINUTES[slug] ?? null : null),
    extra_minute: clock?.extra_minute ?? null,
    period,
    clock_label: clockLabel,
    side: sideOf(team, home, away),
    team_name: text(team.displayName),
    player,
    secondary,
    text: body,
    scoring_play: scoring,
  };
}

/** Timeline → fixture_events-shaped rows. Own goals keep ESPN's side, which is
 * the team credited with the goal, so the timeline halves match the score. */
export function timelineToEvents(eventId: string, timeline: EspnTimelineEntry[]): EspnMatchEvent[] {
  const rows: EspnMatchEvent[] = [];
  for (const t of timeline) {
    if (t.minute == null) continue;
    let type: EspnMatchEvent['type'];
    let detail: string | null;
    let player = t.player;
    let assist = t.secondary;
    switch (t.kind) {
      case 'goal': type = 'goal'; detail = 'Normal Goal'; break;
      case 'own-goal': type = 'goal'; detail = 'Own Goal'; assist = null; break;
      case 'penalty-goal': type = 'goal'; detail = 'Penalty'; assist = null; break;
      case 'penalty-missed': type = 'var'; detail = 'Missed Penalty'; assist = null; break;
      case 'yellow-card': type = 'card'; detail = 'Yellow Card'; assist = null; break;
      case 'red-card': type = 'card'; detail = /yellow/i.test(t.label) ? 'Second Yellow card' : 'Red Card'; assist = null; break;
      // fixture_events: player_name = the player going off, assist_name = coming on.
      case 'substitution': type = 'subst'; detail = 'Substitution'; player = t.secondary; assist = t.player; break;
      case 'var': type = 'var'; detail = null; assist = null; break;
      default: continue;
    }
    rows.push({
      id: t.espn_id ? `espn-${t.espn_id}` : `espn-${eventId}-${rows.length}`,
      fixture_id: eventId,
      team_id: null,
      side: t.side,
      minute: t.minute,
      extra_minute: t.extra_minute,
      type,
      detail,
      player_name: player,
      assist_name: assist,
    });
  }
  return rows;
}

function derivedFacts(timeline: EspnTimelineEntry[], side: 'home' | 'away'): EspnDerivedFacts {
  const mine = timeline.filter(t => t.side === side);
  const n = (kinds: EspnTimelineKind[]) => mine.filter(t => kinds.includes(t.kind)).length;
  return {
    goals: n(['goal', 'own-goal', 'penalty-goal']),
    yellow_cards: n(['yellow-card']),
    red_cards: n(['red-card']),
    substitutions: n(['substitution']),
    penalties_scored: n(['penalty-goal']),
    penalties_missed: n(['penalty-missed']),
  };
}

const STAT_COLUMNS: Record<string, keyof Omit<EspnSideFacts, 'raw_stats'>> = {
  possessionPct: 'possession',
  totalShots: 'shots',
  shotsOnTarget: 'shots_on_target',
  wonCorners: 'corners',
  foulsCommitted: 'fouls',
  yellowCards: 'yellow_cards',
  redCards: 'red_cards',
  offsides: 'offsides',
  saves: 'saves',
  totalPasses: 'passes',
  passPct: 'pass_accuracy',
};

function sideFacts(statistics: unknown[]): EspnSideFacts | null {
  if (!statistics.length) return null;
  const facts: EspnSideFacts = {
    possession: null, shots: null, shots_on_target: null, corners: null, fouls: null, yellow_cards: null,
    red_cards: null, offsides: null, saves: null, passes: null, pass_accuracy: null, raw_stats: {},
  };
  for (const raw of statistics) {
    const s = object(raw);
    const name = text(s.name);
    const value = numeric(s.displayValue ?? s.value);
    if (!name || value == null) continue;
    facts.raw_stats[name] = value;
    const column = STAT_COLUMNS[name];
    if (!column) continue;
    // ESPN reports percentages either as 0–1 fractions (passPct) or 0–100.
    if (column === 'pass_accuracy' || column === 'possession') {
      const pct = value <= 1 ? value * 100 : value;
      facts[column] = Math.round(pct * 10) / 10;
    } else facts[column] = Math.round(value);
  }
  return facts;
}

function lineup(roster: JsonObject): EspnLineup {
  const players = list(roster.roster).map(raw => {
    const p = object(raw);
    const athlete = object(p.athlete);
    return {
      name: text(athlete.displayName) ?? text(athlete.fullName) ?? 'Unknown',
      jersey: text(p.jersey),
      position: text(object(p.position).abbreviation),
      starter: p.starter === true,
      subbed_in: p.subbedIn === true,
      subbed_out: p.subbedOut === true,
    };
  });
  return {
    formation: text(roster.formation),
    starters: players.filter(p => p.starter),
    bench: players.filter(p => !p.starter),
  };
}

/** Normalize one ESPN soccer summary payload. Throws when the payload is not
 * the requested event or has no two sides; degrades (nulls, empty lists) when
 * optional sections are missing, which is common for lower-round cup ties. */
export function normalizeEspnMatch(summary: unknown, ctx: { eventId: string; cup: EspnCup; fetchedAt: string }): EspnMatchDetail {
  const s = object(summary);
  const header = object(s.header);
  const headerId = text(header.id);
  if (headerId && headerId !== ctx.eventId) throw new Error(`ESPN returned event ${headerId}, expected ${ctx.eventId}`);
  const competition = object(list(header.competitions)[0]);
  const competitors = list(competition.competitors).map(object);
  const homeRaw = competitors.find(c => c.homeAway === 'home');
  const awayRaw = competitors.find(c => c.homeAway === 'away');
  if (!homeRaw || !awayRaw) throw new Error(`ESPN event ${ctx.eventId}: missing home or away side`);
  const home = teamSummary(homeRaw);
  const away = teamSummary(awayRaw);
  const statusType = object(object(competition.status).type);
  const state = statusType.state;
  const kickoff = text(competition.date);

  const timeline = list(s.keyEvents)
    .map(raw => timelineEntry(raw, home, away))
    .filter((t): t is EspnTimelineEntry => !!t);

  const boxTeams = list(object(s.boxscore).teams).map(object);
  const statsFor = (side: 'home' | 'away') => sideFacts(list(boxTeams.find(t => t.homeAway === side)?.statistics));
  const homeFacts = statsFor('home');
  const awayFacts = statsFor('away');

  const rosters = list(s.rosters).map(object);
  const rosterFor = (side: 'home' | 'away') => rosters.find(r => r.homeAway === side);
  const homeRoster = rosterFor('home');
  const awayRoster = rosterFor('away');

  const commentary = list(s.commentary).map(object)
    .map(c => ({ sequence: count(c.sequence) ?? 0, clock_label: text(object(c.time).displayValue) ?? '', text: text(c.text) ?? '' }))
    .filter(c => c.text)
    .sort((a, b) => a.sequence - b.sequence);

  const gameInfo = object(s.gameInfo);
  return {
    espn_event_id: ctx.eventId,
    competition_slug: ctx.cup.slug,
    source_url: `https://www.espn.com/soccer/match/_/gameId/${ctx.eventId}`,
    fetched_at: ctx.fetchedAt,
    kickoff_at: kickoff && Number.isFinite(Date.parse(kickoff)) ? new Date(kickoff).toISOString() : null,
    status: {
      state: state === 'pre' || state === 'in' || state === 'post' ? state : 'unknown',
      description: text(statusType.description),
      detail: text(statusType.detail),
      completed: statusType.completed === true,
    },
    season_name: text(object(header.season).name),
    venue: text(object(gameInfo.venue).fullName),
    attendance: count(gameInfo.attendance),
    referee: text(object(list(gameInfo.officials)[0]).displayName),
    home,
    away,
    timeline,
    events: timelineToEvents(ctx.eventId, timeline),
    facts: homeFacts && awayFacts ? { home: homeFacts, away: awayFacts } : null,
    derived: { home: derivedFacts(timeline, 'home'), away: derivedFacts(timeline, 'away') },
    lineups: homeRoster && awayRoster ? { home: lineup(homeRoster), away: lineup(awayRoster) } : null,
    commentary,
  };
}

/** The summary sections worth keeping for audit, minus player media, links and
 * per-play blobs (which are 4× the size of everything else). */
export function slimEspnSummary(summary: unknown): unknown {
  const s = object(summary);
  const slimRoster = (raw: unknown) => {
    const r = object(raw);
    return {
      homeAway: r.homeAway, formation: r.formation, team: object(r.team).displayName,
      roster: list(r.roster).map(p => {
        const e = object(p);
        const athlete = object(e.athlete);
        return { starter: e.starter, jersey: e.jersey, position: object(e.position).abbreviation, subbedIn: e.subbedIn, subbedOut: e.subbedOut, athlete: { id: athlete.id, displayName: athlete.displayName } };
      }),
    };
  };
  return {
    header: s.header,
    keyEvents: s.keyEvents,
    boxscore: s.boxscore,
    gameInfo: s.gameInfo,
    rosters: list(s.rosters).map(slimRoster),
    commentary: list(s.commentary).map(c => { const e = object(c); return { sequence: e.sequence, time: e.time, text: e.text }; }),
  };
}

export function espnSummaryUrl(cup: EspnCup, eventId: string): string {
  return `https://site.web.api.espn.com/apis/site/v2/sports/soccer/${cup.code}/summary?event=${encodeURIComponent(eventId)}`;
}

export async function fetchEspnMatchSummary(cup: EspnCup, eventId: string, fetcher: typeof fetch = fetch): Promise<unknown> {
  if (!/^\d+$/.test(eventId)) throw new Error('Invalid ESPN event id');
  const response = await fetcher(espnSummaryUrl(cup, eventId), { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`ESPN match ${eventId}: HTTP ${response.status}`);
  const payload = object(await response.json());
  if (!payload.header) throw new Error(`ESPN match ${eventId}: no match header in response`);
  return payload;
}

export async function fetchEspnMatch(cup: EspnCup, eventId: string, fetcher: typeof fetch = fetch): Promise<{ detail: EspnMatchDetail; raw: unknown }> {
  const summary = await fetchEspnMatchSummary(cup, eventId, fetcher);
  const detail = normalizeEspnMatch(summary, { eventId, cup, fetchedAt: new Date().toISOString() });
  return { detail, raw: slimEspnSummary(summary) };
}

export function toStoredEspnMatchDetail(detail: EspnMatchDetail, raw: unknown): StoredEspnMatchDetail {
  return {
    espn_event_id: detail.espn_event_id,
    competition_slug: detail.competition_slug,
    detail,
    raw_payload: raw,
    event_count: detail.events.length,
    has_team_stats: detail.facts != null,
    fetched_at: detail.fetched_at,
  };
}

/** Fetch + store the detail for one imported cup fixture. The fixture must
 * already be in the private cup table (the detail row references it). */
export async function extractEspnMatch(sb: SupabaseClient, fixture: Pick<CupFixture, 'espn_event_id'>, cup: EspnCup, fetcher: typeof fetch = fetch): Promise<StoredEspnMatchDetail> {
  const { detail, raw } = await fetchEspnMatch(cup, fixture.espn_event_id, fetcher);
  const row = toStoredEspnMatchDetail(detail, raw);
  const { error } = await sb.from(ESPN_MATCH_DETAIL_TABLE).upsert(row, { onConflict: 'espn_event_id' });
  if (error) throw new Error(`Match detail could not be saved: ${error.message}`);
  return row;
}

export async function loadEspnCupFixture(sb: SupabaseClient, eventId: string): Promise<CupFixture | null> {
  const { data, error } = await sb.from(ESPN_CUP_TABLE)
    .select('espn_event_id,competition_slug,espn_competition_code,season_start,round_label,kickoff_at,kickoff_time_confirmed,status,status_detail,home_espn_id,away_espn_id,home_team_name,away_team_name,home_score,away_score,home_penalties,away_penalties,winner_espn_id,venue,notes,source_url,fetched_at')
    .eq('espn_event_id', eventId).maybeSingle();
  if (error) throw new Error(`Could not load cup fixture: ${error.message}`);
  return (data as CupFixture | null) ?? null;
}
