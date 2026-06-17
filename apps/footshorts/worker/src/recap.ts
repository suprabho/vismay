/**
 * Rolling "last X hours" recap generator.
 *
 * For a trailing time window ending "now" (default 24h), this builds `recap.md` —
 * an editorial brief for the story-gen pipeline — by combining three things we
 * already collect:
 *   1. Match results + per-side stats from the `fixtures` / `fixture_stats` tables
 *      (kept fresh by scores.ts / fixtures.ts).
 *   2. In-match events (goals/cards/subs) from `fixture_events` (kept fresh by
 *      events.ts), surfaced as a per-match fs:match-timeline and goals line.
 *   3. Scraped, Gemini-summarized stories from `articles` published in the window,
 *      matched to the matches via shared team entities.
 *
 * Output is HYBRID: deterministic results/stats tables + a Gemini-written narrative
 * (an overview plus one short paragraph per match). Each run INSERTS a new snapshot
 * row into the `daily_recaps` table (surrogate `id` key), so the admin keeps a
 * timeline of recaps rather than one-per-day.
 *
 * Gating: we only include fixtures in the window that have actually finished, and
 * no-op if none have. (Unfinished/live fixtures in the window are simply skipped —
 * there's no "wait for the day to end" hold, since a rolling window never "ends".)
 *
 * Usage:
 *   npm run recap                         # last 24h, scope=all
 *   npm run recap -- --hours=12           # last 12h
 *   npm run recap -- --hours=48 --scope=premier-league
 *   npm run recap -- --team=real-madrid          # only this team's match(es)
 *   npm run recap -- --hours=12 --scope=la-liga --team=real-madrid
 *   npm run recap -- --out=recap.md       # also write the markdown to a local file
 *   npm run recap -- --dry                # build + print, don't write to Supabase
 *
 * Filters:
 *   --hours=<N>                window length in hours (default 24).
 *   --scope=<competition_slug> restricts to one competition (default 'all').
 *   --team=<team_slug>         restricts to fixtures the team played (home or away).
 * The two filters compose. The stored `scope` namespaces a team filter as
 * `team:<slug>` (scope 'all') or `<competition>:team:<slug>`.
 */

import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

type Args = {
  hours: number; // trailing window length in hours
  scope: string; // 'all' | competition_slug
  team: string | null; // team_slug | null
  dry: boolean;
  out: string | null;
};

const DEFAULT_HOURS = 24;

function parseArgs(argv: string[]): Args {
  let hours = DEFAULT_HOURS;
  let scope = 'all';
  let team: string | null = null;
  let dry = false;
  let out: string | null = null;

  for (const a of argv) {
    if (a.startsWith('--hours=') || /^\d+$/.test(a)) {
      const raw = a.startsWith('--hours=') ? a.slice('--hours='.length) : a;
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) hours = n;
      else console.warn(`[recap] ignoring invalid --hours value: ${raw}`);
    } else if (a === '--dry') dry = true;
    else if (a.startsWith('--scope=')) scope = a.slice('--scope='.length);
    else if (a.startsWith('--team=')) team = a.slice('--team='.length) || null;
    else if (a.startsWith('--out=')) out = a.slice('--out='.length);
    else if (a === '--out') out = 'recap.md';
    else console.warn(`[recap] ignoring unknown arg: ${a}`);
  }

  return { hours, scope, team, dry, out };
}

// ---------------------------------------------------------------------------
// Types (subset of the columns we read)
// ---------------------------------------------------------------------------

type Fixture = {
  id: string;
  competition_slug: string;
  season: string;
  matchday: number | null;
  stage: string | null;
  phase: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  kickoff_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home_ht_score: number | null;
  away_ht_score: number | null;
  venue: string | null;
};

// Row shape from the `standings` table (see worker/src/fixtures.ts syncStandings).
type StandingDbRow = {
  competition_slug: string;
  season: string;
  team_id: string;
  group_label: string | null;
  phase: string | null;
  position: number;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  form: string | null;
};

type FixtureStat = {
  fixture_id: string;
  side: 'home' | 'away';
  shots: number | null;
  shots_on_target: number | null;
  possession: number | null;
  corners: number | null;
  fouls: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  offsides: number | null;
};

// One in-match event from `fixture_events` (goals/cards/subs), kept fresh by the
// events worker from API-Football. Same shape the fs:match-timeline module takes.
type FixtureEvent = {
  id: string;
  fixture_id: string;
  team_id: string | null;
  side: 'home' | 'away' | null;
  minute: number;
  extra_minute: number | null;
  type: 'goal' | 'card' | 'subst' | 'var';
  detail: string | null; // "Normal Goal" | "Own Goal" | "Penalty" | "Yellow Card" | "Red Card" | ...
  player_name: string | null;
  assist_name: string | null;
};

type Article = {
  id: string;
  headline: string;
  summary: string | null;
  publisher: string;
  url: string;
  image_url: string | null;
  published_at: string;
  is_cluster_lead: boolean;
};

type EntityLite = { id: string; type: string; slug: string; name: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TimeWindow = { lo: string; hi: string };

/** Trailing window of `hours` ending at `now` (both ISO, UTC). */
function hoursWindow(hours: number, now: Date): TimeWindow {
  const lo = new Date(now.getTime() - hours * 60 * 60 * 1000);
  return { lo: lo.toISOString(), hi: now.toISOString() };
}

function titleize(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function kickoffHm(iso: string): string {
  // HH:MM UTC — kept simple/deterministic; downstream story-gen can localize.
  return `${iso.slice(11, 16)} UTC`;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadFixtures(timeWindow: TimeWindow, scope: string, teamId: string | null): Promise<Fixture[]> {
  const { lo, hi } = timeWindow;
  let q = supabase
    .from('fixtures')
    .select(
      'id, competition_slug, season, matchday, stage, phase, home_team_id, away_team_id, home_team_name, away_team_name, kickoff_at, status, home_score, away_score, home_ht_score, away_ht_score, venue',
    )
    .gte('kickoff_at', lo)
    .lt('kickoff_at', hi)
    .order('competition_slug', { ascending: true })
    .order('kickoff_at', { ascending: true });
  if (scope !== 'all') q = q.eq('competition_slug', scope);
  // Team filter: the side it played on (home or away).
  if (teamId) q = q.or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Fixture[];
}

/** Resolve a team slug to its entity (id/slug/name), or null if no such team. */
async function loadTeamBySlug(slug: string): Promise<EntityLite | null> {
  const { data, error } = await supabase
    .from('entities')
    .select('id, type, slug, name')
    .eq('type', 'team')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return (data as EntityLite) ?? null;
}

async function loadEntities(ids: string[]): Promise<Map<string, EntityLite>> {
  const map = new Map<string, EntityLite>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from('entities')
    .select('id, type, slug, name')
    .in('id', ids);
  if (error) throw error;
  for (const e of (data ?? []) as EntityLite[]) map.set(e.id, e);
  return map;
}

async function loadLeagueNames(slugs: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (slugs.length === 0) return map;
  const { data, error } = await supabase
    .from('entities')
    .select('slug, name')
    .eq('type', 'league')
    .in('slug', slugs);
  if (error) throw error;
  for (const e of (data ?? []) as { slug: string; name: string }[]) map.set(e.slug, e.name);
  return map;
}

async function loadStats(fixtureIds: string[]): Promise<Map<string, { home?: FixtureStat; away?: FixtureStat }>> {
  const map = new Map<string, { home?: FixtureStat; away?: FixtureStat }>();
  if (fixtureIds.length === 0) return map;
  const { data, error } = await supabase
    .from('fixture_stats')
    .select('fixture_id, side, shots, shots_on_target, possession, corners, fouls, yellow_cards, red_cards, offsides')
    .in('fixture_id', fixtureIds);
  if (error) throw error;
  for (const s of (data ?? []) as FixtureStat[]) {
    const e = map.get(s.fixture_id) ?? {};
    e[s.side] = s;
    map.set(s.fixture_id, e);
  }
  return map;
}

/** fixture_id -> its in-match events (goals/cards/subs), ordered by minute. */
async function loadFixtureEvents(fixtureIds: string[]): Promise<Map<string, FixtureEvent[]>> {
  const map = new Map<string, FixtureEvent[]>();
  if (fixtureIds.length === 0) return map;
  const { data, error } = await supabase
    .from('fixture_events')
    .select('id, fixture_id, team_id, side, minute, extra_minute, type, detail, player_name, assist_name')
    .in('fixture_id', fixtureIds)
    .order('fixture_id', { ascending: true })
    .order('minute', { ascending: true });
  if (error) throw error;
  for (const e of (data ?? []) as FixtureEvent[]) {
    const arr = map.get(e.fixture_id) ?? [];
    arr.push(e);
    map.set(e.fixture_id, arr);
  }
  return map;
}

async function loadWindowArticles(timeWindow: TimeWindow): Promise<Article[]> {
  const { lo, hi } = timeWindow;
  const { data, error } = await supabase
    .from('articles')
    .select('id, headline, summary, publisher, url, image_url, published_at, is_cluster_lead')
    .eq('status', 'summarized')
    .gte('published_at', lo)
    .lt('published_at', hi)
    .order('is_cluster_lead', { ascending: false })
    .order('published_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Article[];
}

/** article_id -> set of entity ids tagged on it, restricted to the entities that played. */
async function loadArticleTeamLinks(
  articleIds: string[],
  teamIds: string[],
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (articleIds.length === 0 || teamIds.length === 0) return map;
  const { data, error } = await supabase
    .from('article_entities')
    .select('article_id, entity_id')
    .in('article_id', articleIds)
    .in('entity_id', teamIds);
  if (error) throw error;
  for (const r of (data ?? []) as { article_id: string; entity_id: string }[]) {
    const set = map.get(r.article_id) ?? new Set<string>();
    set.add(r.entity_id);
    map.set(r.article_id, set);
  }
  return map;
}

/** Current league table for a competition+season (skips group-stage tables). */
async function loadStandings(compSlug: string, season: string): Promise<StandingDbRow[]> {
  const { data, error } = await supabase
    .from('standings')
    .select(
      'competition_slug, season, team_id, group_label, phase, position, played, won, draw, lost, goals_for, goals_against, goal_difference, points, form',
    )
    .eq('competition_slug', compSlug)
    .eq('season', season)
    .order('position', { ascending: true });
  if (error) throw error;
  // Only the single league table — group-stage cup tables (phase 'group') don't
  // map onto the fs:standings-table module's single-table shape.
  return ((data ?? []) as StandingDbRow[]).filter((r) => r.phase !== 'group');
}

/** Every knockout fixture for a competition+season, for building a bracket. */
async function loadKnockoutFixtures(compSlug: string, season: string): Promise<Fixture[]> {
  const { data, error } = await supabase
    .from('fixtures')
    .select(
      'id, competition_slug, season, matchday, stage, phase, home_team_id, away_team_id, home_team_name, away_team_name, kickoff_at, status, home_score, away_score, home_ht_score, away_ht_score, venue',
    )
    .eq('competition_slug', compSlug)
    .eq('season', season)
    .eq('phase', 'knockout')
    .order('kickoff_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Fixture[];
}

// ---------------------------------------------------------------------------
// Shaping
// ---------------------------------------------------------------------------

type MatchView = {
  idx: number; // stable index used to map Gemini narratives back
  fixture: Fixture;
  home: string;
  away: string;
  stats: { home?: FixtureStat; away?: FixtureStat };
  events: FixtureEvent[];
  articles: Article[];
};

type CompetitionView = {
  slug: string;
  name: string;
  matches: MatchView[];
};

function teamName(id: string | null, fallback: string | null, entities: Map<string, EntityLite>): string {
  if (id) {
    const e = entities.get(id);
    if (e) return e.name;
  }
  return fallback ?? 'Unknown';
}

// ---------------------------------------------------------------------------
// Gemini narrative (hybrid layer)
// ---------------------------------------------------------------------------

type Narrative = {
  dayOverview: string;
  matchNarratives: { idx: number; narrative: string }[];
};

const NARRATIVE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    dayOverview: {
      type: SchemaType.STRING,
      description:
        '3–4 sentence editorial overview of the day across all competitions: the headline results, the standout performances, the through-lines a writer could pursue. Factual, no invented detail.',
    },
    matchNarratives: {
      type: SchemaType.ARRAY,
      description: 'One entry per match provided in the input, keyed by its idx.',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          idx: { type: SchemaType.NUMBER, description: 'The match idx from the input.' },
          narrative: {
            type: SchemaType.STRING,
            description:
              '2–3 sentence factual recap of this match: the result, how it unfolded (use the score, half-time score, stats and the goals/red cards provided), and any angle the linked stories surface. Do not invent goalscorers or events not present in the inputs.',
          },
        },
        required: ['idx', 'narrative'],
      },
    },
  },
  required: ['dayOverview', 'matchNarratives'],
};

const NARRATIVE_SYSTEM = `You are a football sports-desk editor writing an internal brief.
The brief feeds a downstream story-generation pipeline, so be factual and concise — no opinion, no hype, no invented facts.
You will receive the finished matches from a recent time window (scores, half-time scores, venues, per-side stats, and the goals and red cards with scorer and minute where available) and the stories scraped in that window, matched to each match.
Ground every claim in the data provided. Name goalscorers and minutes only when they appear in a match's events; if events, stats, or stories are missing, recap only what the score tells you. Never fabricate goalscorers, minutes, or quotes.`;

function buildNarrativeInput(windowLabel: string, comps: CompetitionView[]): unknown {
  return {
    window: windowLabel,
    competitions: comps.map((c) => ({
      competition: c.name,
      matches: c.matches.map((m) => {
        const f = m.fixture;
        const s = m.stats;
        return {
          idx: m.idx,
          fixture: `${m.home} vs ${m.away}`,
          score: f.home_score != null && f.away_score != null ? `${f.home_score}-${f.away_score}` : null,
          half_time:
            f.home_ht_score != null && f.away_ht_score != null
              ? `${f.home_ht_score}-${f.away_ht_score}`
              : null,
          status: f.status,
          venue: f.venue,
          stats: {
            possession: s.home?.possession != null ? `${s.home.possession}-${s.away?.possession ?? '?'}` : null,
            shots: s.home?.shots != null ? `${s.home.shots}-${s.away?.shots ?? '?'}` : null,
            shots_on_target:
              s.home?.shots_on_target != null ? `${s.home.shots_on_target}-${s.away?.shots_on_target ?? '?'}` : null,
            cards: s.home?.yellow_cards != null || s.home?.red_cards != null
              ? `${s.home?.yellow_cards ?? 0}Y/${s.home?.red_cards ?? 0}R – ${s.away?.yellow_cards ?? 0}Y/${s.away?.red_cards ?? 0}R`
              : null,
          },
          // Goals + sendings-off only — the narrative-worthy events. Side resolves
          // to a team name so the model can attribute each one without guessing.
          events: m.events
            .filter((e) => e.type === 'goal' || (e.type === 'card' && e.detail === 'Red Card'))
            .map((e) => ({
              minute: e.extra_minute != null ? `${e.minute}+${e.extra_minute}` : `${e.minute}`,
              team: e.side === 'home' ? m.home : e.side === 'away' ? m.away : null,
              type: e.type === 'goal' ? 'goal' : 'red_card',
              detail: e.detail,
              player: e.player_name,
              assist: e.assist_name,
            })),
          stories: m.articles.slice(0, 6).map((a) => ({
            headline: a.headline,
            summary: a.summary,
            publisher: a.publisher,
          })),
        };
      }),
    })),
  };
}

async function generateNarrative(windowLabel: string, comps: CompetitionView[]): Promise<Narrative | null> {
  if (!GEMINI_API_KEY) {
    console.warn('[recap] GEMINI_API_KEY not set — emitting deterministic-only recap (no narrative).');
    return null;
  }
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: NARRATIVE_SYSTEM,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: NARRATIVE_SCHEMA as any,
      temperature: 0.4,
      maxOutputTokens: 8000,
    },
  });

  const input = buildNarrativeInput(windowLabel, comps);
  const prompt = `Write the recap brief for the matches below.\n\n${JSON.stringify(input, null, 2)}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text) as Narrative;
    if (!parsed || typeof parsed.dayOverview !== 'string' || !Array.isArray(parsed.matchNarratives)) {
      console.warn('[recap] Gemini output missing expected shape — falling back to deterministic-only.');
      return null;
    }
    return parsed;
  } catch (e) {
    console.warn(`[recap] narrative generation failed (${(e as Error).message}) — deterministic-only recap.`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Markdown assembly
// ---------------------------------------------------------------------------

function statsLine(s: { home?: FixtureStat; away?: FixtureStat }): string | null {
  const h = s.home;
  const a = s.away;
  if (!h && !a) return null;
  const parts: string[] = [];
  const pair = (label: string, hv: number | null | undefined, av: number | null | undefined) => {
    if (hv == null && av == null) return;
    parts.push(`${label} ${hv ?? '–'}/${av ?? '–'}`);
  };
  pair('Poss%', h?.possession, a?.possession);
  pair('Shots', h?.shots, a?.shots);
  pair('On target', h?.shots_on_target, a?.shots_on_target);
  pair('Corners', h?.corners, a?.corners);
  pair('Yellow', h?.yellow_cards, a?.yellow_cards);
  pair('Red', h?.red_cards, a?.red_cards);
  return parts.length ? parts.join(' · ') + ' _(home/away)_' : null;
}

/** Deterministic goals line ("Saka 23', Haaland 45+2' (pen)"), or null if no goals
 *  were recorded — keeps the text recap readable without rendering the timeline. */
function goalsLine(events: FixtureEvent[]): string | null {
  const goals = events.filter((e) => e.type === 'goal');
  if (goals.length === 0) return null;
  return goals
    .map((e) => {
      const min = e.extra_minute != null ? `${e.minute}+${e.extra_minute}'` : `${e.minute}'`;
      const tag = e.detail === 'Own Goal' ? ' (OG)' : e.detail === 'Penalty' ? ' (pen)' : '';
      return `${e.player_name ?? 'Unknown'} ${min}${tag}`;
    })
    .join(', ');
}

/** Leading thumbnail token (markdown image) for an article, or '' if it has no image. */
function articleThumb(a: Article): string {
  return a.image_url ? `![](${a.image_url}) ` : '';
}

function articleBullet(a: Article): string {
  const lead = a.is_cluster_lead ? '★ ' : '';
  const summary = a.summary ? ` — ${a.summary}` : '';
  return `  - ${articleThumb(a)}${lead}[${a.headline}](${a.url}) · _${a.publisher}_${summary}`;
}

// ---------------------------------------------------------------------------
// fs: viz directives (see @vismay/viz-engine recapFences)
//
// Each is a fenced block whose info-string is the module type and whose body is
// the module's foreground config as JSON. The recap viewer (@vismay/ui
// RecapMarkdown) mounts these live, and story-gen ingests them as foreground
// layers. We AUGMENT the existing prose with these — the text recap stays
// readable on its own.
// ---------------------------------------------------------------------------

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Emit one ```fs:<type> JSON fence. */
function fsFence(type: string, config: Record<string, unknown>): string {
  return ['```' + type, JSON.stringify(config), '```'].join('\n');
}

/** Build a {id,slug,name,crest_url} team ref the fs: modules expect. */
function teamRef(id: string | null, fallbackName: string | null, entities: Map<string, EntityLite>) {
  const e = id ? entities.get(id) : undefined;
  const name = e?.name ?? fallbackName ?? 'Unknown';
  return {
    id: id ?? slugify(name),
    slug: e?.slug ?? slugify(name),
    name,
    crest_url: null,
  };
}

/** Reshape a DB fixture into the FixtureRow shape fs:match-* / fs:bracket take. */
function fixtureRow(f: Fixture, entities: Map<string, EntityLite>): Record<string, unknown> {
  return {
    id: f.id,
    competition_slug: f.competition_slug,
    season: f.season,
    matchday: f.matchday,
    stage: f.stage,
    phase: f.phase,
    kickoff_at: f.kickoff_at,
    status: f.status,
    home_score: f.home_score,
    away_score: f.away_score,
    home_team_name: f.home_team_name,
    away_team_name: f.away_team_name,
    home: teamRef(f.home_team_id, f.home_team_name, entities),
    away: teamRef(f.away_team_id, f.away_team_name, entities),
  };
}

function matchCardFence(m: MatchView, comp: CompetitionView): string {
  const f = m.fixture;
  const score = f.home_score != null && f.away_score != null ? `${f.home_score}–${f.away_score}` : undefined;
  const competition = f.matchday != null ? `${comp.name} · matchday ${f.matchday}` : comp.name;
  const config: Record<string, unknown> = {
    layout: 'score',
    home: m.home,
    away: m.away,
    competition,
    competitionSlug: comp.slug,
    kickoff: kickoffHm(f.kickoff_at),
  };
  if (score) config.score = score;
  return fsFence('fs:match-card', config);
}

/** Live match-event timeline (goals/cards/subs). Null when no events were recorded. */
function matchTimelineFence(events: FixtureEvent[]): string | null {
  if (events.length === 0) return null;
  return fsFence('fs:match-timeline', { events, filter: 'all' });
}

function standingsTableFence(rows: StandingDbRow[], entities: Map<string, EntityLite>): string | null {
  if (rows.length === 0) return null;
  const modelRows = rows.map((r) => ({
    competition_slug: r.competition_slug,
    season: r.season,
    team_id: r.team_id,
    position: r.position,
    played: r.played,
    won: r.won,
    draw: r.draw,
    lost: r.lost,
    goals_for: r.goals_for,
    goals_against: r.goals_against,
    goal_difference: r.goal_difference,
    points: r.points,
    form: r.form,
    team: teamRef(r.team_id, null, entities),
  }));
  return fsFence('fs:standings-table', { rows: modelRows });
}

function bracketFence(
  fixtures: Fixture[],
  entities: Map<string, EntityLite>,
  comp: CompetitionView,
): string | null {
  if (fixtures.length === 0) return null;
  return fsFence('fs:bracket', {
    layout: 'list',
    competitionSlug: comp.slug,
    title: comp.name,
    fixtures: fixtures.map((f) => fixtureRow(f, entities)),
  });
}

function assembleMarkdown(
  windowLabel: string,
  scopeLabel: string,
  comps: CompetitionView[],
  narrative: Narrative | null,
  unmatched: Article[],
  fixtureCount: number,
  articleCount: number,
  entities: Map<string, EntityLite>,
  standingsByComp: Map<string, StandingDbRow[]>,
  knockoutByComp: Map<string, Fixture[]>,
): string {
  const narrByIdx = new Map<number, string>();
  if (narrative) for (const n of narrative.matchNarratives) narrByIdx.set(n.idx, n.narrative);

  const out: string[] = [];

  out.push(`# Match recap — ${windowLabel}`);
  out.push('');
  out.push(
    `_Editorial brief for story-gen · ${scopeLabel} · ${fixtureCount} match${fixtureCount === 1 ? '' : 'es'}, ${articleCount} stor${articleCount === 1 ? 'y' : 'ies'}._`,
  );
  out.push('');

  if (narrative?.dayOverview) {
    out.push('## Overview');
    out.push('');
    out.push(narrative.dayOverview);
    out.push('');
  }

  for (const c of comps) {
    out.push(`## ${c.name}`);
    out.push('');
    for (const m of c.matches) {
      const f = m.fixture;
      const scoreOrStatus =
        f.home_score != null && f.away_score != null
          ? `${f.home_score}–${f.away_score}`
          : f.status;
      out.push(`### ${m.home} ${scoreOrStatus} ${m.away}`);
      out.push('');

      const meta: string[] = [];
      if (f.home_ht_score != null && f.away_ht_score != null) meta.push(`HT ${f.home_ht_score}–${f.away_ht_score}`);
      meta.push(kickoffHm(f.kickoff_at));
      if (f.matchday != null) meta.push(`MD ${f.matchday}`);
      if (f.venue) meta.push(f.venue);
      out.push(`*${meta.join(' · ')}*`);
      out.push('');

      // Augment the prose with a live match card (keeps the text below).
      out.push(matchCardFence(m, c));
      out.push('');

      // And the in-match event timeline (goals/cards/subs), when we have events.
      const timeline = matchTimelineFence(m.events);
      if (timeline) {
        out.push(timeline);
        out.push('');
      }

      const narr = narrByIdx.get(m.idx);
      if (narr) {
        out.push(narr);
        out.push('');
      }

      const gl = goalsLine(m.events);
      if (gl) {
        out.push(`- **Goals:** ${gl}`);
      }
      const sl = statsLine(m.stats);
      if (sl) {
        out.push(`- **Stats:** ${sl}`);
      }
      if (m.articles.length) {
        out.push('- **Stories:**');
        for (const a of m.articles) out.push(articleBullet(a));
      }
      out.push('');
    }

    // Competition-level visuals: the current league table, and — for knockout
    // competitions with ties in play — the bracket.
    const standings = standingsTableFence(standingsByComp.get(c.slug) ?? [], entities);
    if (standings) {
      out.push('### Table');
      out.push('');
      out.push(standings);
      out.push('');
    }
    const bracket = bracketFence(knockoutByComp.get(c.slug) ?? [], entities, c);
    if (bracket) {
      out.push('### Bracket');
      out.push('');
      out.push(bracket);
      out.push('');
    }
  }

  if (unmatched.length) {
    out.push(`## Other stories from ${windowLabel}`);
    out.push('');
    out.push('_Football news published today not tied to a finished match above._');
    out.push('');
    for (const a of unmatched) {
      const lead = a.is_cluster_lead ? '★ ' : '';
      const summary = a.summary ? ` — ${a.summary}` : '';
      out.push(`- ${articleThumb(a)}${lead}[${a.headline}](${a.url}) · _${a.publisher}_${summary}`);
    }
    out.push('');
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  }

  const args = parseArgs(process.argv.slice(2));

  // Resolve the optional team filter up front so we can fail loudly on a bad slug
  // rather than silently recapping the whole window.
  const team = args.team ? await loadTeamBySlug(args.team) : null;
  if (args.team && !team) {
    console.log(`[recap] no team entity found for slug "${args.team}"; nothing to recap.`);
    return;
  }
  const teamId = team?.id ?? null;

  // Trailing window ending now. All loaders share this single `now` so fixtures
  // and articles are bounded by the same instant.
  const now = new Date();
  const timeWindow = hoursWindow(args.hours, now);
  const windowLabel = `last ${args.hours}h`;

  // Labels + stored scope. A team filter gets its own namespaced scope so it's
  // distinguishable in the timeline.
  const compLabel = args.scope === 'all' ? 'All competitions' : titleize(args.scope);
  const scopeLabel = team
    ? args.scope === 'all'
      ? team.name
      : `${team.name} · ${compLabel}`
    : compLabel;
  const storageScope = team
    ? args.scope === 'all'
      ? `team:${team.slug}`
      : `${args.scope}:team:${team.slug}`
    : args.scope;

  console.log(`[recap] window=${windowLabel} scope=${storageScope}${args.dry ? ' (dry)' : ''}`);

  const fixtures = await loadFixtures(timeWindow, args.scope, teamId);
  if (fixtures.length === 0) {
    const where = [args.scope !== 'all' ? ` in ${args.scope}` : '', team ? ` for ${team.name}` : ''].join('');
    console.log(`[recap] no fixtures with a kickoff in the ${windowLabel}${where}; nothing to recap.`);
    return;
  }

  // Gating: include only fixtures that have actually finished within the window.
  // Live/scheduled ones are simply skipped (a rolling window never "ends").
  const finished = fixtures.filter((f) => f.status === 'finished');
  if (finished.length === 0) {
    console.log(`[recap] no finished fixtures in the ${windowLabel}; nothing to recap.`);
    return;
  }

  // Resolve names.
  const teamIds = Array.from(
    new Set(finished.flatMap((f) => [f.home_team_id, f.away_team_id]).filter((x): x is string => !!x)),
  );
  const entities = await loadEntities(teamIds);
  const compSlugs = Array.from(new Set(finished.map((f) => f.competition_slug)));
  const leagueNames = await loadLeagueNames(compSlugs);
  const stats = await loadStats(finished.map((f) => f.id));
  const eventsByFixture = await loadFixtureEvents(finished.map((f) => f.id));

  // Articles published in the window + their team links.
  const windowArticles = await loadWindowArticles(timeWindow);
  const articleLinks = await loadArticleTeamLinks(windowArticles.map((a) => a.id), teamIds);

  // Build match views with stable indices, attaching matched stories.
  let idx = 0;
  const byComp = new Map<string, MatchView[]>();
  const matchedArticleIds = new Set<string>();

  for (const f of finished) {
    const home = teamName(f.home_team_id, f.home_team_name, entities);
    const away = teamName(f.away_team_id, f.away_team_name, entities);
    const sideIds = new Set([f.home_team_id, f.away_team_id].filter((x): x is string => !!x));

    const matched = windowArticles.filter((a) => {
      const linked = articleLinks.get(a.id);
      if (!linked) return false;
      for (const id of linked) if (sideIds.has(id)) return true;
      return false;
    });
    for (const a of matched) matchedArticleIds.add(a.id);

    const view: MatchView = {
      idx: idx++,
      fixture: f,
      home,
      away,
      stats: stats.get(f.id) ?? {},
      events: eventsByFixture.get(f.id) ?? [],
      articles: matched,
    };
    const arr = byComp.get(f.competition_slug) ?? [];
    arr.push(view);
    byComp.set(f.competition_slug, arr);
  }

  const comps: CompetitionView[] = Array.from(byComp.entries())
    .map(([slug, matches]) => ({
      slug,
      name: leagueNames.get(slug) ?? titleize(slug),
      matches,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // For a team-scoped recap, the window's other football news is noise — keep the
  // brief to the team's match(es) and the stories tied to them.
  const unmatched = team ? [] : windowArticles.filter((a) => !matchedArticleIds.has(a.id));
  const articleCount = team ? matchedArticleIds.size : windowArticles.length;

  // Competition-level viz data for the fs: directives: the current league table
  // for each competition, and the full bracket for any competition that had a
  // knockout tie in the window. Season comes from the comp's fixtures.
  const isKnockout = (f: Fixture) =>
    f.phase === 'knockout' ||
    (f.stage != null && /(FINAL|SEMI|QUARTER|ROUND_OF|LAST_|PLAY_OFF)/i.test(f.stage));

  const standingsByComp = new Map<string, StandingDbRow[]>();
  const knockoutByComp = new Map<string, Fixture[]>();
  for (const c of comps) {
    const season = c.matches[0]!.fixture.season;
    standingsByComp.set(c.slug, await loadStandings(c.slug, season));
    if (c.matches.some((m) => isKnockout(m.fixture))) {
      knockoutByComp.set(c.slug, await loadKnockoutFixtures(c.slug, season));
    }
  }

  // Enrich the entity map with teams that appear only in the table / bracket
  // (standings include every team in the league, not just the window's players) so
  // their fs: team refs resolve a proper slug + name.
  const extraTeamIds = new Set<string>();
  for (const rows of standingsByComp.values()) for (const r of rows) extraTeamIds.add(r.team_id);
  for (const fx of knockoutByComp.values()) {
    for (const f of fx) {
      if (f.home_team_id) extraTeamIds.add(f.home_team_id);
      if (f.away_team_id) extraTeamIds.add(f.away_team_id);
    }
  }
  const missing = Array.from(extraTeamIds).filter((id) => !entities.has(id));
  if (missing.length) {
    const more = await loadEntities(missing);
    for (const [id, e] of more) entities.set(id, e);
  }

  // Hybrid: Gemini narrative over the structured window.
  const narrative = await generateNarrative(windowLabel, comps);

  const markdown = assembleMarkdown(
    windowLabel,
    scopeLabel,
    comps,
    narrative,
    unmatched,
    finished.length,
    articleCount,
    entities,
    standingsByComp,
    knockoutByComp,
  );

  if (args.out) {
    writeFileSync(args.out, markdown, 'utf8');
    console.log(`[recap] wrote ${markdown.length} chars to ${args.out}`);
  }

  if (args.dry) {
    console.log('\n----- recap.md (dry run, not written to Supabase) -----\n');
    console.log(markdown);
    return;
  }

  // Each run is a fresh snapshot in the timeline — insert, don't upsert.
  const { error } = await supabase.from('daily_recaps').insert({
    scope: storageScope,
    window_hours: args.hours,
    window_start: timeWindow.lo,
    window_end: timeWindow.hi,
    markdown,
    model: narrative ? GEMINI_MODEL : null,
    fixture_count: finished.length,
    article_count: articleCount,
    generated_at: timeWindow.hi,
  });
  if (error) throw error;

  console.log(
    `[recap] stored daily_recaps[${windowLabel}/${storageScope}]: ${finished.length} matches, ${articleCount} stories, ` +
      `narrative=${narrative ? 'yes' : 'no'}.`,
  );
}

main().catch((e) => {
  console.error('[recap] fatal:', e);
  process.exit(1);
});
