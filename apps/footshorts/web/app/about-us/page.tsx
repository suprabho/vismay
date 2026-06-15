'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  MatchRow,
  MatchTile,
  darkenHex,
  getCompetitionPalette,
} from '@vismay/footshorts-viz/web';
import { useTheme } from '@footshorts/brand/web';
import { themes, type ThemeName } from '@footshorts/brand';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthProvider';
import { useLeagueCrestMap } from '@/lib/useLeagueCrestMap';
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

const FIXTURE_COLS = `
  id, competition_slug, season, matchday, stage, kickoff_at, status,
  home_score, away_score, home_team_name, away_team_name,
  home:entities!fixtures_home_team_id_fkey(id, slug, name, crest_url),
  away:entities!fixtures_away_team_id_fkey(id, slug, name, crest_url)
`;

// Snapshot query adds primary_color so MatchTile can theme itself to each
// team. Otherwise identical to FIXTURE_COLS — both shapes satisfy FixtureRow
// (primary_color is optional on FixtureTeamRef).
const SNAPSHOT_COLS = `
  id, competition_slug, season, matchday, stage, kickoff_at, status,
  home_score, away_score, home_team_name, away_team_name,
  home:entities!fixtures_home_team_id_fkey(id, slug, name, crest_url, primary_color),
  away:entities!fixtures_away_team_id_fkey(id, slug, name, crest_url, primary_color)
`;

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

// Recent results + next upcoming — for the top-of-page snapshot strip.
function useLandingMatchSnapshot() {
  return useQuery({
    queryKey: ['landing', 'snapshot'],
    queryFn: async (): Promise<FixtureRow[]> => {
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
        ...((past.data ?? []) as unknown as FixtureRow[]).reverse(),
        ...((upcoming.data ?? []) as unknown as FixtureRow[]),
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

export default function AboutUs() {
  // Persist auth state on the marketing page: a returning, signed-in visitor
  // shouldn't be asked to log in again. We surface a "Go to the app" CTA that
  // routes to the same destination the root redirector uses — onboarding if
  // they haven't finished it, the feed otherwise.
  const { session, profile, loading } = useAuth();
  const isAuthed = !loading && !!session;
  const appHref =
    session && profile && !profile.onboarded_at ? '/onboarding/leagues' : '/feed';

  return (
    <main className="relative min-h-screen overflow-hidden bg-bg font-sans text-text">
      <BackgroundGlow />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-3">
          <Logo size={36} />
          <Wordmark className="text-2xl" />
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-muted sm:flex">
          <a href="#features" className="hover:text-text">Features</a>
          <a href="#coverage" className="hover:text-text">Coverage</a>
          <a href="#themes" className="hover:text-text">Themes</a>
        </nav>
        <div className="flex items-center gap-3">
          <ThemeSwitcher />
          <Link
            href={isAuthed ? appHref : '/login'}
            className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-text shadow-[0_12px_30px_-10px_rgba(194,65,12,0.45)] transition hover:brightness-95 active:scale-[0.97]"
          >
            {isAuthed ? 'Go to the app' : 'Log in'}
          </Link>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-12 pt-20 sm:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            Matchday · Live now
          </span>
          <h1 className="mt-6 font-display text-5xl font-normal leading-[1.04] tracking-tight sm:text-6xl md:text-7xl">
            Football, but only the
            <br />
            <em className="not-italic text-brand">good bits.</em>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-muted sm:text-lg">
            Every goal, skill and last-gasp winner — fixtures, form, and
            AI-summarized headlines for the clubs you actually follow, in one
            calm feed.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={isAuthed ? appHref : '/login'}
              className="inline-flex w-full items-center justify-center rounded-lg bg-brand px-6 py-3 text-base font-semibold text-brand-text shadow-[0_12px_30px_-10px_rgba(194,65,12,0.45)] transition hover:brightness-95 active:scale-[0.97] sm:w-auto"
            >
              {isAuthed ? 'Go to the app' : 'Log in to continue'}
            </Link>
            {!isAuthed ? (
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-surface px-6 py-3 text-base font-medium text-text transition hover:border-muted sm:w-auto"
              >
                Create an account
              </Link>
            ) : null}
          </div>
        </div>

        <div className="relative mx-auto mt-16 max-w-6xl">
          <div className="absolute inset-x-10 -bottom-6 h-24 rounded-full bg-brand/20 blur-3xl" />
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
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-brand">
            Why footshorts
          </span>
          <h2 className="mt-3 font-display text-3xl font-normal tracking-tight sm:text-4xl">
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
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-brand">
              Coverage
            </span>
            <h2 className="mt-3 font-display text-3xl font-normal tracking-tight sm:text-4xl">
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

      <section
        id="themes"
        className="relative z-10 border-t border-border bg-surface/30"
      >
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-brand">
              Make it yours
            </span>
            <h2 className="mt-3 font-display text-3xl font-normal tracking-tight sm:text-4xl">
              Three looks, named for the game.
            </h2>
            <p className="mt-4 text-muted">
              Switch the whole app between Classic, Pitch and Terrace — same
              feed, your mood. Tap one to preview it right here.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {THEME_OPTIONS.map((option) => (
              <ThemeCard key={option.name} option={option} />
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-4xl px-6 py-24">
        <div className="relative overflow-hidden rounded-[28px] border border-border bg-surface/60 px-8 py-16 text-center backdrop-blur sm:px-16">
          {/* Signature triangular grid wash — faint brand watermark. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              backgroundImage: 'url(/brand/grid-texture.svg)',
              backgroundSize: '120px',
            }}
          />
          <div className="absolute inset-x-0 -top-20 mx-auto h-40 w-40 rounded-full bg-brand/30 blur-3xl" />
          <div className="relative flex justify-center">
            <Logo size={64} />
          </div>
          <h2 className="relative mt-6 font-display text-3xl font-normal tracking-tight sm:text-4xl">
            Get the good bits.
          </h2>
          <p className="relative mt-4 text-muted">
            {isAuthed
              ? 'Pick up where you left off — your clubs are waiting.'
              : 'Free to watch. Sign in to start following your clubs.'}
          </p>
          <div className="relative mt-8 flex justify-center">
            <Link
              href={isAuthed ? appHref : '/login'}
              className="inline-flex items-center justify-center rounded-lg bg-brand px-6 py-3 text-base font-semibold text-brand-text shadow-[0_12px_30px_-10px_rgba(194,65,12,0.45)] transition hover:brightness-95 active:scale-[0.97]"
            >
              {isAuthed ? 'Go to the app' : 'Log in to Footshorts'}
            </Link>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-2.5">
                <Logo size={30} />
                <Wordmark className="text-lg" />
              </div>
              <p className="mt-3 text-sm text-muted">
                Football, but only the good bits. The short-form home of the
                game.
              </p>
            </div>
            <FooterColumn
              heading="Product"
              links={[
                { label: 'Features', href: '#features' },
                { label: 'Coverage', href: '#coverage' },
                { label: 'Themes', href: '#themes' },
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
            <span>© 2026 Footshorts</span>
            <span>Made for the terraces.</span>
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
      {/* Signature triangular grid — faint brand watermark across the page. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: 'url(/brand/grid-texture.svg)',
          backgroundSize: '118px 204px',
          backgroundRepeat: 'repeat',
          maskImage:
            'radial-gradient(120% 80% at 50% 0%, black 35%, transparent 80%)',
          WebkitMaskImage:
            'radial-gradient(120% 80% at 50% 0%, black 35%, transparent 80%)',
        }}
      />
      <div className="absolute left-1/2 top-[-20%] h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />
      <div className="absolute left-[10%] top-[30%] h-[20rem] w-[20rem] rounded-full bg-brand/[0.06] blur-3xl" />
    </div>
  );
}

// The real footshorts mark — coral app-icon squircle with the F-frame and the
// dimensional S-ball. Shipped as an SVG asset; never redrawn by hand.
function Logo({ size = 32 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/logo-icon.svg"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className="rounded-[24%]"
      style={{ width: size, height: size }}
    />
  );
}

// The wordmark, one word, set in the display face.
function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`font-display font-normal tracking-tight ${className}`}
    >
      Footshorts
    </span>
  );
}

/* ---------- theming ---------- */

// The product's three real themes, surfaced as a "make it yours" feature.
// Names/descriptions mirror the in-app theme set; colours are read straight
// from the brand package so previews stay true to the in-app scheme.
const THEME_OPTIONS: { name: ThemeName; label: string; desc: string }[] = [
  {
    name: 'classic',
    label: 'Classic',
    desc: 'Neutral near-black. Just you and the football.',
  },
  {
    name: 'pitch',
    label: 'Pitch',
    desc: 'Deep green-black, floodlit. Built for the night game.',
  },
  {
    name: 'terrace',
    label: 'Terrace',
    desc: 'Warm cream, daylight. The stands on a sunny away day.',
  },
];

// Compact header control — re-themes the whole surface live via the shared
// ThemeProvider (the same switch the app uses), so the swatch colours are the
// genuine theme tokens.
function ThemeSwitcher() {
  const { themeName, setTheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="hidden items-center gap-1 rounded-full border border-border bg-surface/60 p-1 backdrop-blur sm:flex"
    >
      {THEME_OPTIONS.map((option) => {
        const c = themes[option.name].colors;
        const active = themeName === option.name;
        return (
          <button
            key={option.name}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => setTheme(option.name)}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition ${
              active ? 'ring-2 ring-brand' : 'opacity-70 hover:opacity-100'
            }`}
          >
            <span
              className="relative h-4 w-4 overflow-hidden rounded-full border border-white/20"
              style={{ background: c.bg }}
            >
              <span
                className="absolute bottom-0 right-0 h-2 w-2 rounded-full"
                style={{ background: c.accent }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

// A clickable preview card rendered in its own theme's colours (independent of
// the active page theme), so all three looks are visible at once.
function ThemeCard({
  option,
}: {
  option: (typeof THEME_OPTIONS)[number];
}) {
  const { themeName, setTheme } = useTheme();
  const c = themes[option.name].colors;
  const active = themeName === option.name;
  return (
    <button
      type="button"
      onClick={() => setTheme(option.name)}
      aria-pressed={active}
      className="group flex min-h-[210px] flex-col justify-between rounded-[20px] border p-6 text-left transition duration-200 hover:-translate-y-0.5"
      style={{
        background: c.bg,
        color: c.text,
        borderColor: active ? c.brand : c.border,
        boxShadow: active ? `0 0 0 2px ${c.brand}` : undefined,
      }}
    >
      <div>
        <div className="flex items-center justify-between">
          <span className="font-display text-2xl leading-none">
            {option.label}
          </span>
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider"
            style={{
              background: active ? c.brand : 'transparent',
              color: active ? c.brandText : c.muted,
              border: active ? 'none' : `1px solid ${c.border}`,
            }}
          >
            {active ? 'Active' : 'Preview'}
          </span>
        </div>
        <p className="mt-2 text-sm" style={{ color: c.muted }}>
          {option.desc}
        </p>
      </div>
      <div className="mt-6 flex gap-2.5">
        {(
          [
            ['Surface', c.surface],
            ['Brand', c.brand],
            ['Accent', c.accent],
            ['Border', c.border],
          ] as const
        ).map(([label, col]) => (
          <span
            key={label}
            title={label}
            className="h-8 w-8 rounded-lg border"
            style={{ background: col, borderColor: c.border }}
          />
        ))}
      </div>
    </button>
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
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-brand">
          {label}
        </span>
        <h3 className="mt-3 font-display text-3xl font-normal tracking-tight sm:text-4xl">
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
    <div className="mb-3 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/15 text-brand">
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
                      ? 'bg-brand text-brand-text'
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
        <span className="min-w-[3rem] text-center font-mono text-xs font-medium tabular-nums text-muted">
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
  const base = getCompetitionPalette(league.slug);
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
