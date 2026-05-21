'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MatchRow } from '@vismay/footshort-viz/web';
import { useAuth } from '@/lib/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { FixtureRow } from '@/lib/useFixtures';

/* ---------- data hooks (anon-readable: articles, entities, fixtures) ---------- */

type LandingArticle = {
  id: string;
  headline: string;
  summary: string | null;
  image_url: string | null;
  publisher: string;
  published_at: string;
};

type LandingEntity = {
  id: string;
  slug: string;
  name: string;
  country: string | null;
  crest_url: string | null;
  primary_color: string | null;
};

// Curated by recognizable-club / top-league slug. Slugs come from the worker's
// commonName + slugify pipeline (strips FC/CF/SSC/AS/AC/... and trailing years),
// so "Arsenal FC" → "arsenal", "FC Barcelona" → "barcelona", etc.
const POPULAR_TEAM_SLUGS = [
  'arsenal',
  'chelsea',
  'liverpool',
  'manchester-city',
  'manchester-united',
  'tottenham-hotspur',
  'real-madrid',
  'barcelona',
  'atletico-de-madrid',
  'club-atletico-de-madrid',
  'bayern-munchen',
  'borussia-dortmund',
  'juventus',
  'milan',
  'internazionale-milano',
  'napoli',
  'roma',
  'paris-saint-germain',
];

const POPULAR_LEAGUE_SLUGS = [
  'premier-league',
  'primera-division',
  'bundesliga',
  'serie-a',
  'ligue-1',
  'champions-league',
  'europa-league',
  'primeira-liga',
  'eredivisie',
  'championship',
  'campeonato-brasileiro-serie-a',
  'european-championship',
  'world-cup',
];

// Display name + fallback color per competition slug. Used by the colorful
// hero match tiles when a team is missing a primary_color of its own.
const LEAGUE_NAME_BY_SLUG: Record<string, string> = {
  'premier-league': 'Premier League',
  'primera-division': 'La Liga',
  bundesliga: 'Bundesliga',
  'serie-a': 'Serie A',
  'ligue-1': 'Ligue 1',
  'champions-league': 'Champions League',
  'europa-league': 'Europa League',
  'world-cup': 'World Cup',
  'european-championship': 'Euros',
  eredivisie: 'Eredivisie',
  'primeira-liga': 'Primeira Liga',
  championship: 'Championship',
  'campeonato-brasileiro-serie-a': 'Brasileirão',
};

const COMPETITION_PALETTE: Record<string, string> = {
  'premier-league': '#3D195B',
  'primera-division': '#E2231A',
  bundesliga: '#D20515',
  'serie-a': '#0066CC',
  'ligue-1': '#091C3E',
  'champions-league': '#0E1E5B',
  'europa-league': '#FF6900',
  'world-cup': '#7B2D26',
  'european-championship': '#001A70',
  eredivisie: '#F47C20',
  'primeira-liga': '#006B3F',
  championship: '#1A1A1A',
  // CBF green — original yellow killed white-text contrast on the league tile.
  'campeonato-brasileiro-serie-a': '#009C3B',
};

// Quick darken helper for two-stop competition gradients on the league tiles.
function darkenHex(hex: string, amount = 0.35): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const r = Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount)));
  return `rgb(${r}, ${g}, ${b})`;
}

const FIXTURE_COLS = `
  id, competition_slug, season, matchday, stage, kickoff_at, status,
  home_score, away_score, home_team_name, away_team_name,
  home:entities!fixtures_home_team_id_fkey(id, slug, name, crest_url),
  away:entities!fixtures_away_team_id_fkey(id, slug, name, crest_url)
`;

// Snapshot query adds primary_color so the colorful match tiles can theme
// themselves to each team. Kept separate from FIXTURE_COLS so the existing
// MatchRow paths (which type against FixtureTeamRef) stay typed correctly.
const SNAPSHOT_COLS = `
  id, competition_slug, kickoff_at, status,
  home_score, away_score, home_team_name, away_team_name,
  home:entities!fixtures_home_team_id_fkey(id, slug, name, crest_url, primary_color),
  away:entities!fixtures_away_team_id_fkey(id, slug, name, crest_url, primary_color)
`;

type SnapshotTeam = {
  id: string;
  slug: string;
  name: string;
  crest_url: string | null;
  primary_color: string | null;
};

type SnapshotFixture = {
  id: string;
  competition_slug: string | null;
  kickoff_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home_team_name: string | null;
  away_team_name: string | null;
  home: SnapshotTeam | null;
  away: SnapshotTeam | null;
};

function priorityIndex(slug: string, list: string[]): number {
  const i = list.indexOf(slug);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
}

function useLandingArticles(limit = 6) {
  return useQuery({
    queryKey: ['landing', 'articles', limit],
    queryFn: async (): Promise<LandingArticle[]> => {
      const { data, error } = await supabase
        .from('articles')
        .select('id, headline, summary, image_url, publisher, published_at')
        .eq('status', 'summarized')
        .not('image_url', 'is', null)
        .order('published_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as LandingArticle[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useLandingLeagues() {
  return useQuery({
    queryKey: ['landing', 'leagues'],
    queryFn: async (): Promise<LandingEntity[]> => {
      const { data, error } = await supabase
        .from('entities')
        .select('id, slug, name, country, crest_url, primary_color')
        .eq('type', 'league')
        .not('crest_url', 'is', null)
        .limit(30);
      if (error) throw error;
      return ((data ?? []) as LandingEntity[])
        .sort((a, b) => {
          const pa = priorityIndex(a.slug, POPULAR_LEAGUE_SLUGS);
          const pb = priorityIndex(b.slug, POPULAR_LEAGUE_SLUGS);
          if (pa !== pb) return pa - pb;
          return a.name.localeCompare(b.name);
        })
        .slice(0, 12);
    },
    staleTime: 60 * 60 * 1000,
  });
}

function useLandingTeams(limit = 6) {
  return useQuery({
    queryKey: ['landing', 'teams', limit],
    queryFn: async (): Promise<LandingEntity[]> => {
      const { data, error } = await supabase
        .from('entities')
        .select('id, slug, name, country, crest_url, primary_color')
        .eq('type', 'team')
        .in('slug', POPULAR_TEAM_SLUGS)
        .not('crest_url', 'is', null);
      if (error) throw error;
      return ((data ?? []) as LandingEntity[])
        .sort(
          (a, b) =>
            priorityIndex(a.slug, POPULAR_TEAM_SLUGS) -
            priorityIndex(b.slug, POPULAR_TEAM_SLUGS),
        )
        .slice(0, limit);
    },
    staleTime: 10 * 60 * 1000,
  });
}

// Slug → crest_url for every seeded league. Tiny query (≤30 rows) used to
// theme each MatchTile's watermark with the right competition logo.
function useLeagueCrestMap() {
  return useQuery({
    queryKey: ['landing', 'leagueCrestMap'],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from('entities')
        .select('slug, crest_url')
        .eq('type', 'league')
        .not('crest_url', 'is', null);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as { slug: string; crest_url: string }[]) {
        map[row.slug] = row.crest_url;
      }
      return map;
    },
    staleTime: 60 * 60 * 1000,
  });
}

// Recent results + next upcoming — for the top-of-page snapshot strip.
function useLandingMatchSnapshot() {
  return useQuery({
    queryKey: ['landing', 'snapshot'],
    queryFn: async (): Promise<SnapshotFixture[]> => {
      const now = new Date().toISOString();
      const [past, upcoming] = await Promise.all([
        supabase
          .from('fixtures')
          .select(SNAPSHOT_COLS)
          .eq('status', 'finished')
          .lt('kickoff_at', now)
          .order('kickoff_at', { ascending: false })
          .limit(3),
        supabase
          .from('fixtures')
          .select(SNAPSHOT_COLS)
          .gte('kickoff_at', now)
          .order('kickoff_at', { ascending: true })
          .limit(6),
      ]);
      if (past.error) throw past.error;
      if (upcoming.error) throw upcoming.error;
      const merged = [
        ...((past.data ?? []) as unknown as SnapshotFixture[]).reverse(),
        ...((upcoming.data ?? []) as unknown as SnapshotFixture[]),
      ];
      return merged;
    },
    staleTime: 60 * 1000,
  });
}

function useLandingFixtures(limit = 4) {
  return useQuery({
    queryKey: ['landing', 'fixtures', limit],
    queryFn: async (): Promise<FixtureRow[]> => {
      const { data, error } = await supabase
        .from('fixtures')
        .select(FIXTURE_COLS)
        .gte('kickoff_at', new Date().toISOString())
        .order('kickoff_at', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as FixtureRow[];
    },
    staleTime: 60 * 1000,
  });
}

/* ---------- page ---------- */

export default function Index() {
  const { session, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!session) return;
    if (!profile) return;
    if (!profile.onboarded_at) {
      router.replace('/onboarding/leagues');
      return;
    }
    router.replace('/feed');
  }, [loading, session, profile, router]);

  if (loading || session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-bg text-text">
      <BackgroundGlow />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="text-lg font-bold tracking-tight">
            Short<span className="text-accent">Foot</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted sm:flex">
          <a href="#features" className="hover:text-text">Features</a>
          <a href="#coverage" className="hover:text-text">Coverage</a>
        </nav>
        <Link
          href="/login"
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg hover:opacity-90"
        >
          Log in
        </Link>
      </header>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-12 pt-20 sm:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Football, distilled
          </span>
          <h1 className="mt-6 text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
            Your football
            <br />
            <span className="text-accent">in short.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-muted sm:text-lg">
            Every team, every league, every headline you care about — fixtures,
            form, and AI-summarized news in one calm feed.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-lg bg-accent px-6 py-3 text-base font-semibold text-bg hover:opacity-90 sm:w-auto"
            >
              Log in to continue
            </Link>
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-surface px-6 py-3 text-base font-medium text-text hover:border-muted sm:w-auto"
            >
              Create an account
            </Link>
          </div>
        </div>

        <div className="relative mx-auto mt-16 max-w-6xl">
          <div className="absolute inset-x-10 -bottom-6 h-24 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative">
            <PreviewLabel icon="schedule">Matches &amp; results</PreviewLabel>
            <HeroMatchTiles />
          </div>
        </div>
      </section>

      <section
        id="features"
        className="relative z-10 mx-auto max-w-6xl px-6 py-24 sm:py-32"
      >
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-medium uppercase tracking-wider text-accent">
            Features
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            More than just a feed.
          </h2>
          <p className="mt-4 text-muted">
            Everything a fan needs, nothing they don&apos;t.
          </p>
        </div>

        <div className="mt-20 space-y-24">
          <FeatureRow
            label="Step 01 — Watchlist"
            title="Set up your watchlist."
            body="Search for the clubs and leagues you already follow, or discover new ones. We'll keep the feed focused on them — no noise."
            visual={<WatchlistPreview />}
          />
          <FeatureRow
            reverse
            label="Step 02 — Schedule"
            title="Your personal football schedule."
            body="Every game that matters to you, in one single view. Kick-off times and live scores — right from your calendar."
            visual={<SchedulePreview />}
          />
          <FeatureRow
            label="Step 03 — Briefs"
            title="Shorter than a halftime."
            body="Headlines from 10+ publishers, summarized into bite-sized briefs you can read between trains. Swipe through the day's stories."
            visual={<BriefsCardStack />}
          />
          <FeatureRow
            reverse
            label="Step 04 — Stay on top"
            title="Keep on top."
            body="Never miss a game with a daily digest and match reminders that arrive when you actually want them."
            visual={<NotificationsPreview />}
          />
        </div>
      </section>

      <section id="coverage" className="relative z-10 border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-medium uppercase tracking-wider text-accent">
              Coverage
            </span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Every league you watch.
            </h2>
            <p className="mt-4 text-muted">
              Top-flight leagues, cups, and continental tournaments — from
              kick-off to full-time.
            </p>
          </div>
          <CoverageGrid />
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-4xl px-6 py-24">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-surface/60 px-8 py-16 text-center backdrop-blur sm:px-16">
          <div className="absolute inset-x-0 -top-20 mx-auto h-40 w-40 rounded-full bg-accent/30 blur-3xl" />
          <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">
            Football scheduling, simplified.
          </h2>
          <p className="relative mt-4 text-muted">
            Sign in to start following your clubs.
          </p>
          <div className="relative mt-8 flex justify-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3 text-base font-semibold text-bg hover:opacity-90"
            >
              Log in to ShortFoot
            </Link>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <Logo />
                <span className="text-base font-bold tracking-tight">
                  Short<span className="text-accent">Foot</span>
                </span>
              </div>
              <p className="mt-3 text-sm text-muted">
                Football, distilled. Every match, every headline — in short.
              </p>
            </div>
            <FooterColumn
              heading="Product"
              links={[
                { label: 'Features', href: '#features' },
                { label: 'Coverage', href: '#coverage' },
              ]}
            />
            <FooterColumn
              heading="Account"
              links={[
                { label: 'Log in', href: '/login' },
                { label: 'Create account', href: '/login' },
              ]}
            />
            <FooterColumn
              heading="Company"
              links={[
                { label: 'About', href: '#' },
                { label: 'Contact', href: '#' },
              ]}
            />
          </div>
          <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-border pt-6 text-xs text-muted sm:flex-row sm:items-center">
            <span>© ShortFoot</span>
            <span>Made for fans.</span>
          </div>
        </div>
      </footer>
    </main>
  );
}

/* ---------- layout primitives ---------- */

function BackgroundGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute left-1/2 top-[-20%] h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
      <div className="absolute left-[10%] top-[30%] h-[20rem] w-[20rem] rounded-full bg-accent/5 blur-3xl" />
    </div>
  );
}

function Logo() {
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-bg"
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
        <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 2 1.5 1.5L8 6.5 6.5 5 8 3.5Zm-3 3L6.5 8 5 9.5 3.5 8 5 6.5Zm6 0L12.5 8 11 9.5 9.5 8 11 6.5ZM8 9.5l1.5 1.5L8 12.5 6.5 11 8 9.5Z" />
      </svg>
    </span>
  );
}

function FeatureRow({
  label,
  title,
  body,
  visual,
  reverse,
}: {
  label: string;
  title: string;
  body: string;
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div
      className={`grid items-center gap-10 md:grid-cols-2 ${
        reverse ? 'md:[&>:first-child]:order-2' : ''
      }`}
    >
      <div>
        <span className="text-xs font-medium uppercase tracking-wider text-accent">
          {label}
        </span>
        <h3 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          {title}
        </h3>
        <p className="mt-4 text-base text-muted sm:text-lg">{body}</p>
      </div>
      <div>{visual}</div>
    </div>
  );
}

function FooterColumn({
  heading,
  links,
}: {
  heading: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-text">{heading}</h4>
      <ul className="mt-4 space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.label}>
            <Link href={l.href} className="text-muted hover:text-text">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CrestAvatar({
  url,
  size = 40,
  ring = true,
}: {
  url: string | null;
  size?: number;
  ring?: boolean;
}) {
  // Mirrors the chrome the in-app feed uses (white-tinted circle so any-color
  // crests stay visible on the dark background).
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-white/40 ${
        ring ? 'ring-1 ring-border' : ''
      }`}
      style={{ width: size, height: size }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          style={{ width: size * 0.78, height: size * 0.78 }}
          className="object-contain"
        />
      ) : null}
    </div>
  );
}

function relativeTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function kickoffFromNow(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return 'now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h`;
  const d = Math.floor(h / 24);
  return `in ${d}d`;
}

/* ---------- previews fed by real data ---------- */

function PreviewLabel({
  icon,
  children,
}: {
  icon: 'schedule' | 'news';
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-accent">
        {icon === 'schedule' ? (
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden>
            <path d="M5 1.5v1H3.5A1.5 1.5 0 0 0 2 4v9.5A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V4a1.5 1.5 0 0 0-1.5-1.5H11v-1a.5.5 0 0 0-1 0v1H6v-1a.5.5 0 0 0-1 0Zm-2 4H13v8H3v-8Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden>
            <path d="M2.5 3h11v10h-11V3Zm1.5 1.5v1.5h8V4.5H4Zm0 3v1.5h5V7.5H4Zm0 3v1.5h5V10.5H4Zm6 0v1.5h3V10.5h-3Zm0-3v1.5h3V7.5h-3Z" />
          </svg>
        )}
      </span>
      {children}
    </div>
  );
}

function HeroMatchTiles() {
  const { data: fixtures = [], isLoading } = useLandingMatchSnapshot();
  const { data: leagueCrests = {} } = useLeagueCrestMap();
  if (isLoading || fixtures.length === 0) {
    return (
      <div className="-mx-6 overflow-x-auto px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-32 w-56 shrink-0 animate-pulse rounded-xl bg-surface sm:w-60"
            />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="-mx-6 overflow-x-auto px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-3">
        {fixtures.map((f) => (
          <div key={f.id} className="w-56 shrink-0 sm:w-60">
            <MatchTile
              fixture={f}
              competitionCrest={leagueCrests[f.competition_slug ?? ''] ?? null}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchTile({
  fixture,
  competitionCrest,
}: {
  fixture: SnapshotFixture;
  competitionCrest: string | null;
}) {
  const home = fixture.home;
  const away = fixture.away;
  const isFinished = fixture.status === 'finished';
  const isLive = fixture.status === 'live';

  // Background: home primary as base, away primary as gradient tail. Fall back
  // to the per-competition palette if no team color is known.
  const fallback =
    COMPETITION_PALETTE[fixture.competition_slug ?? ''] ?? '#1F2030';
  const homeColor = home?.primary_color ?? fallback;
  const awayColor = away?.primary_color;
  const background =
    awayColor && awayColor.toLowerCase() !== homeColor.toLowerCase()
      ? `linear-gradient(135deg, ${homeColor} 0%, ${homeColor} 55%, ${awayColor} 100%)`
      : homeColor;

  // Top-left label: score for finished games, LIVE pill, or local kick-off
  // time. Day label for non-today fixtures so the strip self-orients.
  let topLabel: React.ReactNode;
  if (isFinished && fixture.home_score !== null && fixture.away_score !== null) {
    topLabel = (
      <span className="font-bold tabular-nums">
        {fixture.home_score} – {fixture.away_score}
      </span>
    );
  } else if (isLive) {
    topLabel = (
      <span className="inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        LIVE
      </span>
    );
  } else {
    const d = new Date(fixture.kickoff_at);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    topLabel = isToday
      ? d.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        })
      : d.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
  }

  const competitionName =
    LEAGUE_NAME_BY_SLUG[fixture.competition_slug ?? ''] ??
    fixture.competition_slug ??
    '';

  const homeName = home?.name ?? fixture.home_team_name ?? 'TBD';
  const awayName = away?.name ?? fixture.away_team_name ?? 'TBD';

  return (
    <div
      className="relative h-32 overflow-hidden rounded-xl p-4 text-white shadow-xl"
      style={{ background }}
    >
      {/* Watermark: the competition crest, enlarged and faded into the
          bottom-right corner. Mirrors the NHL/NBA/UCL logo washes on the
          reference deck. */}
      {competitionCrest ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={competitionCrest}
          alt=""
          aria-hidden
          className="pointer-events-none absolute -right-4 -bottom-4 h-28 w-28 object-contain opacity-25"
        />
      ) : null}

      <div className="relative flex h-full flex-col">
        <div className="text-xs font-bold uppercase tracking-wider">
          {topLabel}
        </div>

        <div className="mt-2 flex-1 space-y-1.5 overflow-hidden">
          <TeamRow name={homeName} crest={home?.crest_url ?? null} />
          <TeamRow name={awayName} crest={away?.crest_url ?? null} />
        </div>

        <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-white/80">
          {competitionName}
        </div>
      </div>
    </div>
  );
}

function TeamRow({
  name,
  crest,
}: {
  name: string;
  crest: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/85">
        {crest ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={crest}
            alt=""
            className="h-4 w-4 object-contain"
          />
        ) : null}
      </span>
      <span className="truncate text-sm font-semibold">{name}</span>
    </div>
  );
}


function WatchlistPreview() {
  const { data: teams = [], isLoading } = useLandingTeams(5);
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-2xl">
      <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-bg/60 px-3 py-2 text-xs text-muted">
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <circle cx="7" cy="7" r="5" />
          <path d="m14 14-3-3" strokeLinecap="round" />
        </svg>
        Search teams, leagues…
      </div>
      <ul className="space-y-2">
        {isLoading || teams.length === 0
          ? Array.from({ length: 4 }).map((_, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-md border border-border bg-bg/60 px-3 py-2"
              >
                <div className="h-9 w-9 animate-pulse rounded-full bg-surface" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 animate-pulse rounded bg-surface" />
                  <div className="h-2.5 w-20 animate-pulse rounded bg-surface" />
                </div>
              </li>
            ))
          : teams.map((t, i) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-md border border-border bg-bg/60 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <CrestAvatar url={t.crest_url} size={36} />
                  <div>
                    <div className="text-sm font-semibold text-text">{t.name}</div>
                    {t.country ? (
                      <div className="text-xs text-muted">{t.country}</div>
                    ) : null}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    i < 2
                      ? 'bg-accent text-bg'
                      : 'border border-border text-muted'
                  }`}
                >
                  {i < 2 ? 'Following' : 'Follow'}
                </span>
              </li>
            ))}
      </ul>
    </div>
  );
}

function SchedulePreview() {
  const { data: fixtures = [], isLoading } = useLandingFixtures(4);
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
      {isLoading || fixtures.length === 0 ? (
        <div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between border-b border-white/10 px-2 py-3 last:border-b-0"
            >
              <div className="h-3 w-24 animate-pulse rounded bg-bg" />
              <div className="h-3 w-12 animate-pulse rounded bg-bg" />
              <div className="h-3 w-24 animate-pulse rounded bg-bg" />
            </div>
          ))}
        </div>
      ) : (
        // -mx-2 absorbs MatchRow's internal p-2 so the away crest sits flush
        // with the card's inner edge. The outer card's overflow-hidden clips
        // the row's overhang at the rounded corners.
        <div className="-mx-2">
          {fixtures.map((f) => (
            <MatchRow key={f.id} fixture={f} />
          ))}
        </div>
      )}
    </div>
  );
}

function BriefsCardStack() {
  const { data: articles = [], isLoading } = useLandingArticles(6);
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);

  if (isLoading || articles.length === 0) {
    return (
      <div className="relative mx-auto h-[420px] max-w-sm">
        <div className="absolute inset-0 animate-pulse rounded-2xl border border-border bg-surface shadow-2xl" />
      </div>
    );
  }

  const total = articles.length;
  const advance = (dir: 1 | -1) => {
    setIndex((prev) => (prev + dir + total) % total);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(true);
    startX.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragX(e.clientX - startX.current);
  };

  const finishDrag = () => {
    if (!dragging) return;
    setDragging(false);
    const threshold = 80;
    if (dragX > threshold) advance(-1);
    else if (dragX < -threshold) advance(1);
    setDragX(0);
  };

  // Front + 2 cards peeking behind. Render back-to-front so DOM order
  // matches stacking order (back card first, front card last).
  const visible: { article: LandingArticle; depth: number }[] = [];
  for (let i = 2; i >= 0; i--) {
    const articleIdx = (index + i) % total;
    visible.push({ article: articles[articleIdx]!, depth: i });
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative mx-auto h-[420px] w-full max-w-sm touch-pan-y select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        {visible.map(({ article, depth }) => (
          <BriefStackCard
            key={`${article.id}-${depth}`}
            article={article}
            depth={depth}
            dragX={depth === 0 ? dragX : 0}
            isDragging={dragging && depth === 0}
          />
        ))}
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => advance(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text hover:border-muted"
          aria-label="Previous brief"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M10.5 3 6 8l4.5 5 1-1L8 8l3.5-4-1-1Z" />
          </svg>
        </button>
        <span className="min-w-[3rem] text-center text-xs font-medium tabular-nums text-muted">
          {index + 1} / {total}
        </span>
        <button
          type="button"
          onClick={() => advance(1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text hover:border-muted"
          aria-label="Next brief"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M5.5 3 10 8l-4.5 5-1-1L8 8 4.5 4l1-1Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function BriefStackCard({
  article,
  depth,
  dragX,
  isDragging,
}: {
  article: LandingArticle;
  depth: number;
  dragX: number;
  isDragging: boolean;
}) {
  const translateY = depth * -10;
  const scale = 1 - depth * 0.04;
  const opacity = 1 - depth * 0.3;
  const rotate = dragX * 0.04;

  const transform =
    depth === 0
      ? `translate3d(${dragX}px, ${translateY}px, 0) rotate(${rotate}deg)`
      : `translate3d(0, ${translateY}px, 0) scale(${scale})`;

  return (
    <article
      className="absolute inset-0 overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
      style={{
        transform,
        opacity,
        zIndex: 10 - depth,
        transition: isDragging
          ? 'none'
          : 'transform 0.3s ease, opacity 0.3s ease',
        cursor: depth === 0 ? (isDragging ? 'grabbing' : 'grab') : 'default',
        pointerEvents: depth === 0 ? 'auto' : 'none',
      }}
    >
      <div className="aspect-[16/10] overflow-hidden bg-bg">
        {article.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.image_url}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : null}
      </div>
      <div className="p-5">
        <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted">
          <span className="rounded-full border border-border bg-bg/60 px-2 py-0.5 text-text">
            {article.publisher}
          </span>
          <span>{relativeTime(article.published_at)}</span>
        </div>
        <h3 className="line-clamp-2 text-base font-semibold leading-snug text-text">
          {article.headline}
        </h3>
        {article.summary ? (
          <p className="mt-2 line-clamp-3 text-sm text-muted">
            {article.summary}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function NotificationsPreview() {
  const { data: fixtures = [], isLoading } = useLandingFixtures(2);
  const { data: articles = [] } = useLandingArticles(1);
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-2xl">
      <ul className="space-y-2">
        <li className="flex items-start gap-3 rounded-md border border-border bg-bg/60 px-3 py-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="currentColor"
              aria-hidden
            >
              <path d="M3 4h10v1.5H3V4Zm0 3.25h10v1.5H3v-1.5Zm0 3.25h7V12H3v-1.5Z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-text">
              Daily digest is ready
            </div>
            <div className="text-xs text-muted">
              {articles.length > 0
                ? `Including: ${articles[0]!.headline.slice(0, 60)}${articles[0]!.headline.length > 60 ? '…' : ''}`
                : '6 stories across your teams.'}
            </div>
          </div>
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
        </li>

        {isLoading || fixtures.length === 0
          ? Array.from({ length: 2 }).map((_, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-md border border-border bg-bg/60 px-3 py-2.5"
              >
                <div className="flex shrink-0 -space-x-2">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-surface" />
                  <div className="h-8 w-8 animate-pulse rounded-full bg-surface" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 animate-pulse rounded bg-surface" />
                  <div className="h-2.5 w-48 animate-pulse rounded bg-surface" />
                </div>
              </li>
            ))
          : fixtures.slice(0, 2).map((f) => {
              const home = f.home?.name ?? f.home_team_name ?? 'TBD';
              const away = f.away?.name ?? f.away_team_name ?? 'TBD';
              return (
                <li
                  key={f.id}
                  className="flex items-start gap-3 rounded-md border border-border bg-bg/60 px-3 py-2.5"
                >
                  <div className="flex shrink-0 -space-x-2">
                    <CrestAvatar url={f.home?.crest_url ?? null} size={32} />
                    <CrestAvatar url={f.away?.crest_url ?? null} size={32} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-text">
                      Kick-off {kickoffFromNow(f.kickoff_at)}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {home} vs {away}
                    </div>
                  </div>
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
                </li>
              );
            })}
      </ul>
    </div>
  );
}

function CoverageGrid() {
  const { data: leagues = [], isLoading } = useLandingLeagues();
  if (isLoading) {
    return (
      <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[4/3] animate-pulse rounded-xl border border-border bg-surface/60"
          />
        ))}
      </div>
    );
  }
  if (leagues.length === 0) return null;
  return (
    <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {leagues.map((l) => (
        <LeagueTile key={l.id} league={l} />
      ))}
    </div>
  );
}

function LeagueTile({ league }: { league: LandingEntity }) {
  const base = COMPETITION_PALETTE[league.slug];
  const background = base
    ? `linear-gradient(135deg, ${base} 0%, ${darkenHex(base, 0.4)} 100%)`
    : 'rgb(var(--sf-color-surface))';

  return (
    <div
      className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border shadow-lg"
      style={{ background }}
    >
      <div className="flex h-full flex-col items-center p-4">
        <div className="flex flex-1 items-center justify-center">
          {league.crest_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={league.crest_url}
              alt=""
              className="h-full max-h-32 w-auto max-w-[80%] object-contain transition-transform duration-300 group-hover:scale-105"
            />
          ) : null}
        </div>
        <div className="w-full text-center">
          <div className="truncate text-sm font-bold leading-tight text-white">
            {league.name}
          </div>
          {league.country ? (
            <div className="truncate text-[11px] text-white/75">
              {league.country}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
