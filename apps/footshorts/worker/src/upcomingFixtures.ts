/**
 * Print upcoming fixtures for a tournament/competition.
 *
 * Debug/admin helper in the spirit of `match:list`, but reads the `fixtures`
 * table that `npm run fixtures` keeps in sync — so it needs no
 * football-data.org token and burns no rate limit. Team names resolve through
 * the entities FKs with the fixture's raw name as fallback for unmapped/TBD
 * sides.
 *
 * Usage:
 *   npm run fixtures:upcoming                              # list competition slugs
 *   npm run fixtures:upcoming -- world-cup                 # next 7 days
 *   npm run fixtures:upcoming -- premier-league --days=14
 *   npm run fixtures:upcoming -- world-cup --all           # every scheduled fixture
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Created in main() after the env guard — supabase-js throws its own less
// helpful error from createClient when the URL is missing.
let supabase: ReturnType<typeof createClient>;

type TeamRef = { name: string } | null;

type FixtureRow = {
  matchday: number | null;
  stage: string | null;
  kickoff_at: string;
  venue: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  home: TeamRef;
  away: TeamRef;
};

function flag(name: string): string | undefined {
  const a = process.argv.slice(2).find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : undefined;
}

function teamName(ref: TeamRef, fallback: string | null): string {
  return ref?.name ?? fallback ?? 'TBD';
}

// "GROUP_STAGE" → "Group Stage", "LAST_16" → "Last 16"
function prettyStage(stage: string | null): string {
  if (!stage) return '';
  return stage
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function round(f: FixtureRow): string {
  if (f.matchday != null) return `MD ${f.matchday}`;
  return prettyStage(f.stage);
}

async function listCompetitions(): Promise<void> {
  const { data, error } = await supabase
    .from('entities')
    .select('slug, name')
    .eq('type', 'league')
    .order('slug');
  if (error) throw error;
  const comps = (data ?? []) as Array<{ slug: string; name: string }>;

  console.log('usage: npm run fixtures:upcoming -- <slug> [--days=N | --all]\n');
  console.log('Available competitions:');
  for (const c of comps) {
    console.log(`  ${c.slug.padEnd(24)} ${c.name}`);
  }
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Competition slug is the first non-flag positional arg; without one, show
  // what's available instead of erroring.
  const slug = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!slug) {
    await listCompetitions();
    return;
  }

  const all = process.argv.includes('--all');
  const days = Number(flag('days') ?? 7);
  const now = new Date();

  let query = supabase
    .from('fixtures')
    .select(
      `matchday, stage, kickoff_at, venue, home_team_name, away_team_name,
       home:entities!fixtures_home_team_id_fkey(name),
       away:entities!fixtures_away_team_id_fkey(name)`,
    )
    .eq('competition_slug', slug)
    .eq('status', 'scheduled')
    .gte('kickoff_at', now.toISOString())
    .order('kickoff_at', { ascending: true });
  if (!all) {
    query = query.lte(
      'kickoff_at',
      new Date(now.getTime() + days * 86400_000).toISOString(),
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  const fixtures = (data ?? []) as unknown as FixtureRow[];

  const window = all ? 'all scheduled' : `next ${days} days`;
  console.log(`[${slug}] ${window}: ${fixtures.length} fixtures`);
  if (fixtures.length === 0) {
    console.log(
      '\nNothing scheduled in this window. Try --all, or run `npm run fixtures` to re-sync.',
    );
    return;
  }

  // Group by UTC date so a matchday reads as a block.
  let currentDay = '';
  for (const f of fixtures) {
    const day = f.kickoff_at.slice(0, 10);
    if (day !== currentDay) {
      currentDay = day;
      console.log(`\n${day}`);
    }
    const time = f.kickoff_at.slice(11, 16);
    const venue = f.venue ? `  @ ${f.venue}` : '';
    console.log(
      `  ${time}Z  ${round(f).padEnd(14)} ` +
        `${teamName(f.home, f.home_team_name).padEnd(24)} vs  ` +
        `${teamName(f.away, f.away_team_name)}${venue}`,
    );
  }
}

main().catch((e) => {
  console.error('[fixtures:upcoming] fatal:', (e as Error).message);
  process.exit(1);
});
