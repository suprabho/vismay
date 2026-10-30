import type { SupabaseClient } from '@supabase/supabase-js';
import { ESPN_CUP_TABLE, normalizeCupStatus, type CupFixture, type CupStatus, type EspnCup } from './espnCups';

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

/** One kick of a penalty shootout. `order` is the order taken when the source
 * gives it (key events, commentary); ESPN's shootout card pairs the kicks by
 * `round` instead and does not say which side went first. */
export interface EspnShootoutKick {
  order: number;
  round?: number | null;
  side: 'home' | 'away' | null;
  team_name: string | null;
  player: string | null;
  result: 'scored' | 'saved' | 'missed';
  text: string;
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
  /** `name` is ESPN's status code (STATUS_FINAL_PEN, …); absent on rows extracted before it was kept. */
  status: { state: 'pre' | 'in' | 'post' | 'unknown'; name?: string | null; description: string | null; detail: string | null; completed: boolean };
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
  /** Shootout kicks in order (empty when there was no shootout or ESPN listed
   * none). Absent on rows extracted before shootouts were read. */
  shootout?: EspnShootoutKick[];
  /** ESPN's notes on the match ("Liverpool advances 6-5 on penalties"). */
  notes?: string[];
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

/** ESPN sends several logo variants per team, tagged by `rel` (["full",
 * "default"], ["full", "dark"], ["full", "scoreboard"], …) in no stable order
 * across competitions. Prefer the default light-surface mark, then anything
 * that isn't a dark variant, and only then whatever came first — never index
 * [0] blindly, or a cup match can show a different crest than the league. */
function teamLogo(team: JsonObject): string | null {
  const logos = list(team.logos).map(object);
  const rel = (logo: JsonObject) => list(logo.rel).filter((r): r is string => typeof r === 'string');
  const pick = logos.find(l => rel(l).includes('default'))
    ?? logos.find(l => !rel(l).includes('dark'))
    ?? logos[0];
  return pick ? text(pick.href) : null;
}

function teamSummary(competitor: JsonObject): EspnTeamSummary {
  const team = object(competitor.team);
  const logo = teamLogo(team) ?? text(team.logo);
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

/** ESPN numbers the shootout as period 5 (after two halves and two halves of
 * extra time); its kicks arrive as penalty key events that are not goals. */
function isShootoutEntry(t: EspnTimelineEntry, slug: string): boolean {
  return (t.kind === 'penalty-goal' || t.kind === 'penalty-missed' || t.kind === 'goal')
    && ((t.period != null && t.period >= 5) || /shootout/i.test(slug));
}

function kickFromEntry(t: EspnTimelineEntry, order: number): EspnShootoutKick {
  const result = t.kind === 'penalty-missed' ? (/sav/i.test(t.label + ' ' + t.text) ? 'saved' : 'missed') : 'scored';
  return { order, side: t.side, team_name: t.team_name, player: t.player, result, text: t.text };
}

const KICK_LIST_KEYS = ['shots', 'attempts', 'kicks', 'penalties', 'shootout', 'plays'] as const;

function kickResult(k: JsonObject): EspnShootoutKick['result'] | null {
  for (const key of ['didScore', 'scored', 'isGoal', 'goal']) {
    if (typeof k[key] === 'boolean') {
      if (k[key]) return 'scored';
      return /sav/i.test(JSON.stringify(k)) ? 'saved' : 'missed';
    }
  }
  const label = [k.result, k.outcome, k.status, k.text, k.shortText, k.displayValue, object(k.type).text, object(k.type).type, object(k.result).text]
    .map(v => text(v)).filter(Boolean).join(' ');
  if (/sav/i.test(label)) return 'saved';
  if (/miss|wide|over|post|bar|fail/i.test(label)) return 'missed';
  if (/scor|goal|convert/i.test(label)) return 'scored';
  return null;
}

function kickPlayer(k: JsonObject): string | null {
  const athlete = object(k.athlete ?? k.player ?? object(list(k.participants)[0]).athlete);
  return text(athlete.displayName) ?? text(athlete.fullName) ?? text(athlete.shortName)
    ?? text(k.player) ?? text(k.playerName) ?? text(k.athleteName) ?? text(k.name);
}

function sideKicks(raw: unknown[], side: 'home' | 'away' | null, team: EspnTeamSummary | null, home: EspnTeamSummary, away: EspnTeamSummary): EspnShootoutKick[] {
  const kicks: EspnShootoutKick[] = [];
  raw.map(object).forEach((k, i) => {
    const result = kickResult(k);
    if (!result) return;
    const kickSide = side ?? sideOf(object(k.team), home, away);
    const kickTeam = team ?? (kickSide === 'home' ? home : kickSide === 'away' ? away : null);
    kicks.push({
      order: 0,
      round: count(k.shotNumber ?? k.round ?? k.number ?? k.attempt) ?? (side ? i + 1 : null),
      side: kickSide,
      team_name: kickTeam?.name ?? text(object(k.team).displayName),
      player: kickPlayer(k),
      result,
      text: text(k.text) ?? '',
    });
  });
  return kicks;
}

/** The kicks behind ESPN's shootout card (Liverpool 6–5 Chelsea: eight rounds,
 * each a home and an away kick marked Scored / Missed / Saved). ESPN has sent
 * this per competitor and as one list with the team on each kick; both are
 * read. Kicks are paired by round, home first, since ESPN does not say which
 * side kicked first. */
export function shootoutFromSummary(summary: unknown, home: EspnTeamSummary, away: EspnTeamSummary): EspnShootoutKick[] {
  const s = object(summary);
  const competition = object(list(object(s.header).competitions)[0]);
  const kicks: EspnShootoutKick[] = [];
  for (const c of list(competition.competitors).map(object)) {
    const side = c.homeAway === 'home' ? 'home' : c.homeAway === 'away' ? 'away' : null;
    if (!side) continue;
    const raw = list(c.shootout ?? c.shootoutAttempts ?? c.penaltyShootout);
    kicks.push(...sideKicks(raw, side, side === 'home' ? home : away, home, away));
  }
  if (!kicks.length) {
    for (const source of [s.shootout, s.penaltyShootout, competition.shootout]) {
      for (const item of list(source).map(object)) {
        const nested = KICK_LIST_KEYS.map(key => item[key]).find(Array.isArray);
        if (nested) {
          const side = sideOf(object(item.team), home, away) ?? (item.homeAway === 'home' ? 'home' : item.homeAway === 'away' ? 'away' : null);
          kicks.push(...sideKicks(nested, side, side === 'home' ? home : side === 'away' ? away : null, home, away));
        } else kicks.push(...sideKicks([item], null, null, home, away));
      }
      if (kicks.length) break;
    }
  }
  if (!kicks.length) return [];
  const sideRank = (k: EspnShootoutKick) => (k.side === 'home' ? 0 : k.side === 'away' ? 1 : 2);
  return kicks
    .map((k, i) => ({ k, i }))
    .sort((a, b) => (a.k.round ?? Infinity) - (b.k.round ?? Infinity) || sideRank(a.k) - sideRank(b.k) || a.i - b.i)
    .map(({ k }, i) => ({ ...k, order: i + 1 }));
}

/** The shootout as ESPN's commentary tells it, between "Penalty Shootout
 * begins" and "Penalty Shootout ends": "Goal! Liverpool 1(4), Chelsea 1(3).
 * Cody Gakpo (Liverpool) converts the penalty…", "Penalty saved! Cole Palmer
 * (Chelsea) fails to capitalise…", "Penalty missed! Bad penalty by X (Y)…". */
export function shootoutFromCommentary(commentary: EspnCommentaryEntry[], home: EspnTeamSummary, away: EspnTeamSummary): EspnShootoutKick[] {
  const kicks: EspnShootoutKick[] = [];
  let inShootout = false;
  for (const c of commentary) {
    if (/penalty shoot-?out begins/i.test(c.text)) { inShootout = true; continue; }
    if (/penalty shoot-?out ends/i.test(c.text)) break;
    if (!inShootout) continue;
    const head = /^\s*(Goal|Penalty saved|Penalty missed)!/i.exec(c.text);
    if (!head) continue;
    const result = /^goal/i.test(head[1]!) ? 'scored' : /saved/i.test(head[1]!) ? 'saved' : 'missed';
    // The kicker is the first "Name (Team)" after the scoreline sentence.
    const rest = result === 'scored' ? c.text.replace(/^[^.]*\.\s*/, '') : c.text.slice(head[0].length);
    const who = /([^.!()]+?)\s*\(([^)]+)\)/.exec(rest);
    const teamName = who ? who[2]!.trim() : null;
    kicks.push({
      order: kicks.length + 1,
      side: teamName === home.name ? 'home' : teamName === away.name ? 'away' : null,
      team_name: teamName,
      player: who ? who[1]!.trim().replace(/^Bad penalty by\s+/i, '') : null,
      result,
      text: c.text,
    });
  }
  return kicks;
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

  // Shootout kicks are not match goals: keep them out of the timeline, the
  // fixture_events rows and the derived goal counts.
  const allEntries = list(s.keyEvents)
    .map(raw => ({ slug: text(object(object(raw).type).type) ?? '', entry: timelineEntry(raw, home, away) }))
    .filter((t): t is { slug: string; entry: EspnTimelineEntry } => !!t.entry);
  const timeline = allEntries.filter(t => !isShootoutEntry(t.entry, t.slug)).map(t => t.entry);
  const shootoutEntries = allEntries.filter(t => isShootoutEntry(t.entry, t.slug)).map(t => t.entry);

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

  // ESPN's shootout data (what its shootout card draws) first, then the key
  // events, then the commentary.
  const fromSummary = shootoutFromSummary(summary, home, away);
  const shootout = fromSummary.length
    ? fromSummary
    : shootoutEntries.length
      ? shootoutEntries.map((t, i) => kickFromEntry(t, i + 1))
      : shootoutFromCommentary(commentary, home, away);
  const notes = list(competition.notes).flatMap(n => {
    const note = text(object(n).text) ?? text(object(n).headline) ?? text(n);
    return note ? [note] : [];
  });

  const gameInfo = object(s.gameInfo);
  return {
    espn_event_id: ctx.eventId,
    competition_slug: ctx.cup.slug,
    source_url: `https://www.espn.com/soccer/match/_/gameId/${ctx.eventId}`,
    fetched_at: ctx.fetchedAt,
    kickoff_at: kickoff && Number.isFinite(Date.parse(kickoff)) ? new Date(kickoff).toISOString() : null,
    status: {
      state: state === 'pre' || state === 'in' || state === 'post' ? state : 'unknown',
      name: text(statusType.name),
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
    shootout,
    notes,
  };
}

/** The detail's normalized cup status (the scoreboard import's vocabulary). */
export function detailCupStatus(detail: Pick<EspnMatchDetail, 'status'>): CupStatus {
  const st = detail.status;
  return normalizeCupStatus({ name: st.name ?? undefined, state: st.state, completed: st.completed });
}

/** The fixture columns the match summary knows better than an older
 * scoreboard import: status, score, shootout, winner, kickoff. A fixture
 * imported before kickoff stays "scheduled" with no score until the next
 * scoreboard import otherwise. Same rule as the import: no score before
 * kickoff (ESPN sends "0" for unplayed games). */
export function fixturePatchFromDetail(detail: EspnMatchDetail): Pick<CupFixture,
  'status' | 'status_detail' | 'home_score' | 'away_score' | 'home_penalties' | 'away_penalties' | 'winner_espn_id'
> & { kickoff_at?: string; notes?: string[] } {
  const status = detailCupStatus(detail);
  const hasScores = status === 'live' || status === 'finished' || status === 'suspended';
  return {
    status,
    status_detail: detail.status.description,
    home_score: hasScores ? detail.home.score : null,
    away_score: hasScores ? detail.away.score : null,
    home_penalties: hasScores ? detail.home.shootout_score : null,
    away_penalties: hasScores ? detail.away.shootout_score : null,
    winner_espn_id: status === 'finished'
      ? (detail.home.winner ? detail.home.espn_id : detail.away.winner ? detail.away.espn_id : null)
      : null,
    ...(detail.kickoff_at ? { kickoff_at: detail.kickoff_at } : {}),
    ...(detail.notes?.length ? { notes: detail.notes } : {}),
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
    ...(s.shootout ? { shootout: s.shootout } : {}),
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
  // Bring the fixture row up to date too (same private table the import
  // writes), so a match imported before kickoff gets its result and shootout.
  const { error: fixtureError } = await sb.from(ESPN_CUP_TABLE)
    .update({ ...fixturePatchFromDetail(detail), fetched_at: detail.fetched_at })
    .eq('espn_event_id', fixture.espn_event_id);
  if (fixtureError) throw new Error(`Cup fixture could not be updated: ${fixtureError.message}`);
  return row;
}

export async function loadEspnCupFixture(sb: SupabaseClient, eventId: string): Promise<CupFixture | null> {
  const { data, error } = await sb.from(ESPN_CUP_TABLE)
    .select('espn_event_id,competition_slug,espn_competition_code,season_start,round_label,kickoff_at,kickoff_time_confirmed,status,status_detail,home_espn_id,away_espn_id,home_team_name,away_team_name,home_score,away_score,home_penalties,away_penalties,winner_espn_id,venue,notes,source_url,fetched_at')
    .eq('espn_event_id', eventId).maybeSingle();
  if (error) throw new Error(`Could not load cup fixture: ${error.message}`);
  return (data as CupFixture | null) ?? null;
}
