/**
 * Daily match-day recap generator.
 *
 * For a target date, this builds `recap.md` — an editorial brief for the story-gen
 * pipeline — by combining two things we already collect:
 *   1. Match results + per-side stats from the `fixtures` / `fixture_stats` tables
 *      (kept fresh by scores.ts / fixtures.ts).
 *   2. Scraped, Gemini-summarized stories from `articles` published that day,
 *      matched to the matches via shared team entities.
 *
 * Output is HYBRID: deterministic results/stats tables + a Gemini-written narrative
 * (a day overview plus one short paragraph per match). The markdown is upserted into
 * the `daily_recaps` table keyed by (recap_date, scope).
 *
 * Gating ("after the last game of that date"): we only generate once EVERY fixture
 * with a kickoff on the target UTC day has a terminal status (finished / postponed /
 * cancelled). If any are still scheduled or live, we no-op — unless --force is passed.
 * Re-running after the day completes is idempotent (upsert).
 *
 * Usage:
 *   npm run recap                         # today (UTC), scope=all
 *   npm run recap -- 2026-06-14           # explicit date
 *   npm run recap -- 2026-06-14 --scope=premier-league
 *   npm run recap -- 2026-06-14 --force   # generate even if matches are still pending
 *   npm run recap -- 2026-06-14 --out=recap.md   # also write the markdown to a local file
 *   npm run recap -- 2026-06-14 --dry     # build + print, don't write to Supabase
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

// Statuses that mean "this match is done for the day" — i.e. it won't change again
// in a way that should hold up the recap.
const TERMINAL_STATUSES = new Set(['finished', 'postponed', 'cancelled']);

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

type Args = {
  date: string; // YYYY-MM-DD (UTC)
  scope: string; // 'all' | competition_slug
  force: boolean;
  dry: boolean;
  out: string | null;
};

function parseArgs(argv: string[]): Args {
  let date: string | null = null;
  let scope = 'all';
  let force = false;
  let dry = false;
  let out: string | null = null;

  for (const a of argv) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(a)) date = a;
    else if (a === '--force') force = true;
    else if (a === '--dry') dry = true;
    else if (a.startsWith('--scope=')) scope = a.slice('--scope='.length);
    else if (a.startsWith('--out=')) out = a.slice('--out='.length);
    else if (a === '--out') out = 'recap.md';
    else console.warn(`[recap] ignoring unknown arg: ${a}`);
  }

  if (!date) date = new Date().toISOString().slice(0, 10);
  return { date, scope, force, dry, out };
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

function dayWindow(date: string): { lo: string; hi: string } {
  const lo = new Date(`${date}T00:00:00.000Z`);
  const hi = new Date(lo.getTime() + 24 * 60 * 60 * 1000);
  return { lo: lo.toISOString(), hi: hi.toISOString() };
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

async function loadFixtures(date: string, scope: string): Promise<Fixture[]> {
  const { lo, hi } = dayWindow(date);
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

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Fixture[];
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

async function loadDayArticles(date: string): Promise<Article[]> {
  const { lo, hi } = dayWindow(date);
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
              '2–3 sentence factual recap of this match: the result, how it unfolded (use the score, half-time score and stats provided), and any angle the linked stories surface. Do not invent goalscorers or events not present in the inputs.',
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
You will receive a day's finished matches (scores, half-time scores, venues, and per-side stats where available) and the stories scraped that day, matched to each match.
Ground every claim in the data provided. If stats or stories are missing for a match, recap only what the score tells you. Never fabricate goalscorers, minutes, or quotes.`;

function buildNarrativeInput(date: string, comps: CompetitionView[]): unknown {
  return {
    date,
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

async function generateNarrative(date: string, comps: CompetitionView[]): Promise<Narrative | null> {
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

  const input = buildNarrativeInput(date, comps);
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
  date: string,
  scope: string,
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
  const scopeLabel = scope === 'all' ? 'All competitions' : titleize(scope);

  out.push(`# Match-day recap — ${date}`);
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

      const narr = narrByIdx.get(m.idx);
      if (narr) {
        out.push(narr);
        out.push('');
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
    out.push(`## Other stories from ${date}`);
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
  console.log(`[recap] date=${args.date} scope=${args.scope}${args.force ? ' (force)' : ''}${args.dry ? ' (dry)' : ''}`);

  const fixtures = await loadFixtures(args.date, args.scope);
  if (fixtures.length === 0) {
    console.log(`[recap] no fixtures with a kickoff on ${args.date}${args.scope !== 'all' ? ` in ${args.scope}` : ''}; nothing to recap.`);
    return;
  }

  // Gating: the day must be done.
  const pending = fixtures.filter((f) => !TERMINAL_STATUSES.has(f.status));
  if (pending.length > 0 && !args.force) {
    console.log(
      `[recap] ${pending.length}/${fixtures.length} fixtures still pending (e.g. ${pending[0]!.status}) — the day isn't over. ` +
        `Skipping. Re-run after the last game finishes, or pass --force.`,
    );
    return;
  }

  const finished = fixtures.filter((f) => f.status === 'finished');
  if (finished.length === 0) {
    console.log(`[recap] day is over but no fixtures finished (all postponed/cancelled); nothing to recap.`);
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

  // Articles for the day + their team links.
  const dayArticles = await loadDayArticles(args.date);
  const articleLinks = await loadArticleTeamLinks(dayArticles.map((a) => a.id), teamIds);

  // Build match views with stable indices, attaching matched stories.
  let idx = 0;
  const byComp = new Map<string, MatchView[]>();
  const matchedArticleIds = new Set<string>();

  for (const f of finished) {
    const home = teamName(f.home_team_id, f.home_team_name, entities);
    const away = teamName(f.away_team_id, f.away_team_name, entities);
    const sideIds = new Set([f.home_team_id, f.away_team_id].filter((x): x is string => !!x));

    const matched = dayArticles.filter((a) => {
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

  const unmatched = dayArticles.filter((a) => !matchedArticleIds.has(a.id));
  const articleCount = dayArticles.length;

  // Competition-level viz data for the fs: directives: the current league table
  // for each competition, and the full bracket for any competition that had a
  // knockout tie today. Season comes from the comp's fixtures (one per comp/day).
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
  // (standings include every team in the league, not just today's players) so
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

  // Hybrid: Gemini narrative over the structured day.
  const narrative = await generateNarrative(args.date, comps);

  const markdown = assembleMarkdown(
    args.date,
    args.scope,
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

  const { error } = await supabase.from('daily_recaps').upsert(
    {
      recap_date: args.date,
      scope: args.scope,
      markdown,
      model: narrative ? GEMINI_MODEL : null,
      fixture_count: finished.length,
      article_count: articleCount,
      generated_at: new Date().toISOString(),
    },
    { onConflict: 'recap_date,scope' },
  );
  if (error) throw error;

  console.log(
    `[recap] stored daily_recaps[${args.date}/${args.scope}]: ${finished.length} matches, ${articleCount} stories, ` +
      `narrative=${narrative ? 'yes' : 'no'}.`,
  );
}

main().catch((e) => {
  console.error('[recap] fatal:', e);
  process.exit(1);
});
