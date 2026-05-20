'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/AuthProvider';

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
          <a href="#features" className="hover:text-text">
            Features
          </a>
          <a href="#how-it-works" className="hover:text-text">
            How it works
          </a>
          <a href="#coverage" className="hover:text-text">
            Coverage
          </a>
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
            The simple way to follow every team, league, and headline you care
            about — fixtures, form, and AI-summarized news in one calm feed.
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

        <div className="relative mx-auto mt-16 max-w-4xl">
          <div className="absolute inset-x-10 -bottom-6 h-24 rounded-full bg-accent/20 blur-3xl" />
          <HeroMockup />
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
            Everything a fan needs, nothing they don't.
          </p>
        </div>

        <div id="how-it-works" className="mt-20 space-y-24">
          <FeatureRow
            label="Step 01 — Watchlist"
            title="Set up your watchlist."
            body="Search for your favourite clubs and leagues, or quickly discover new ones. We'll keep the feed focused on them — no noise."
            visual={<WatchlistMockup />}
          />
          <FeatureRow
            reverse
            label="Step 02 — Schedule"
            title="Your personal football schedule."
            body="Every game that matters to you, in one single view. Kick-off times, broadcast info, and live scores — right from your calendar."
            visual={<ScheduleMockup />}
          />
          <FeatureRow
            label="Step 03 — Briefs"
            title="Shorter than a halftime."
            body="Headlines from 10+ publishers, summarized into bite-sized briefs you can read between trains. The news, in short."
            visual={<BriefsMockup />}
          />
          <FeatureRow
            reverse
            label="Step 04 — Stay on top"
            title="Keep on top."
            body="Never miss a game with a daily digest, match reminders, and team-form alerts that arrive when you actually want them."
            visual={<NotificationsMockup />}
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

          <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {COVERAGE.map((name) => (
              <div
                key={name}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface/60 px-3 py-3 backdrop-blur"
              >
                <CompetitionBadge name={name} size={32} />
                <span className="text-sm font-medium text-text">{name}</span>
              </div>
            ))}
          </div>
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
                { label: 'Overview', href: '#' },
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

/* ---------- shared layout pieces ---------- */

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

/* ---------- crest + competition system ----------
   Stylized brand-color marks (not real licensed logos). Mirrors the
   approach Linear / Stripe / Notion use on marketing surfaces. */

type TeamStyle = {
  short: string;
  primary: string;
  secondary?: string;
  textColor?: string;
  pattern?: 'solid' | 'split' | 'stripes' | 'ring';
};

const TEAMS: Record<string, TeamStyle> = {
  Arsenal: { short: 'ARS', primary: '#EF0107', pattern: 'solid' },
  Chelsea: { short: 'CHE', primary: '#034694', pattern: 'solid' },
  Liverpool: { short: 'LIV', primary: '#C8102E', pattern: 'solid' },
  'Man City': {
    short: 'MCI',
    primary: '#6CABDD',
    textColor: '#0B0B0F',
    pattern: 'solid',
  },
  'Real Madrid': {
    short: 'RMA',
    primary: '#FEBE10',
    secondary: '#FFFFFF',
    textColor: '#0B0B0F',
    pattern: 'ring',
  },
  Barcelona: {
    short: 'BAR',
    primary: '#A50044',
    secondary: '#004D98',
    pattern: 'split',
  },
  'Inter Milan': {
    short: 'INT',
    primary: '#0068A8',
    secondary: '#0B0B0F',
    pattern: 'stripes',
  },
  'Bayern München': { short: 'FCB', primary: '#DC052D', pattern: 'solid' },
  PSG: {
    short: 'PSG',
    primary: '#004170',
    secondary: '#DA291C',
    pattern: 'split',
  },
};

function TeamCrest({ team, size = 28 }: { team: string; size?: number }) {
  const t = TEAMS[team];
  if (!t) {
    return (
      <div
        className="rounded-full bg-surface ring-1 ring-border"
        style={{ width: size, height: size }}
      />
    );
  }
  const text = t.textColor ?? '#FFFFFF';
  const monoSize = Math.max(8, Math.round(size * 0.34));

  if (t.pattern === 'split' && t.secondary) {
    return (
      <div
        className="relative flex overflow-hidden rounded-full ring-1 ring-border"
        style={{ width: size, height: size }}
        aria-label={team}
      >
        <div className="flex-1" style={{ background: t.primary }} />
        <div className="flex-1" style={{ background: t.secondary }} />
        <span
          className="absolute inset-0 flex items-center justify-center font-bold leading-none"
          style={{ color: text, fontSize: monoSize }}
        >
          {t.short}
        </span>
      </div>
    );
  }

  if (t.pattern === 'stripes' && t.secondary) {
    return (
      <div
        className="relative overflow-hidden rounded-full ring-1 ring-border"
        style={{
          width: size,
          height: size,
          background: `repeating-linear-gradient(90deg, ${t.primary} 0 ${Math.max(2, Math.round(size / 8))}px, ${t.secondary} ${Math.max(2, Math.round(size / 8))}px ${Math.max(4, Math.round(size / 4))}px)`,
        }}
        aria-label={team}
      >
        <span
          className="absolute inset-0 flex items-center justify-center font-bold leading-none"
          style={{ color: '#FFFFFF', fontSize: monoSize }}
        >
          {t.short}
        </span>
      </div>
    );
  }

  if (t.pattern === 'ring' && t.secondary) {
    return (
      <div
        className="flex items-center justify-center rounded-full font-bold leading-none ring-1 ring-border"
        style={{
          width: size,
          height: size,
          background: t.secondary,
          color: text,
          fontSize: monoSize,
          boxShadow: `inset 0 0 0 ${Math.max(2, Math.round(size / 10))}px ${t.primary}`,
        }}
        aria-label={team}
      >
        {t.short}
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-center rounded-full font-bold leading-none ring-1 ring-border"
      style={{
        width: size,
        height: size,
        background: t.primary,
        color: text,
        fontSize: monoSize,
      }}
      aria-label={team}
    >
      {t.short}
    </div>
  );
}

type CompetitionStyle = {
  short: string;
  primary: string;
  secondary?: string;
  textColor?: string;
  pattern?: 'solid' | 'diagonal';
};

const COMPETITIONS: Record<string, CompetitionStyle> = {
  'Premier League': { short: 'PL', primary: '#3D195B' },
  'La Liga': { short: 'LL', primary: '#E2231A' },
  'Serie A': { short: 'SA', primary: '#008FD7' },
  Bundesliga: { short: 'BL', primary: '#D20515' },
  'Ligue 1': {
    short: 'L1',
    primary: '#091C3E',
    secondary: '#DA291C',
    pattern: 'diagonal',
  },
  'UEFA Champions League': { short: 'UCL', primary: '#001489' },
  'UEFA Europa League': { short: 'UEL', primary: '#FF6900' },
  'FA Cup': { short: 'FA', primary: '#1A2A6C' },
  'Copa del Rey': {
    short: 'CDR',
    primary: '#AA151B',
    secondary: '#F1BF00',
    pattern: 'diagonal',
  },
  'Coppa Italia': { short: 'CI', primary: '#008C45' },
  MLS: {
    short: 'MLS',
    primary: '#001489',
    secondary: '#DA291C',
    pattern: 'diagonal',
  },
  'World Cup': {
    short: 'WC',
    primary: '#D4AF37',
    textColor: '#0B0B0F',
  },
};

const COVERAGE = [
  'Premier League',
  'La Liga',
  'Serie A',
  'Bundesliga',
  'Ligue 1',
  'UEFA Champions League',
  'UEFA Europa League',
  'FA Cup',
  'Copa del Rey',
  'Coppa Italia',
  'MLS',
  'World Cup',
] as const;

function CompetitionBadge({
  name,
  size = 24,
}: {
  name: string;
  size?: number;
}) {
  const c = COMPETITIONS[name];
  if (!c) {
    return (
      <div
        className="rounded-md bg-surface ring-1 ring-border"
        style={{ width: size, height: size }}
      />
    );
  }
  const text = c.textColor ?? '#FFFFFF';
  const fontSize = Math.max(8, Math.round(size * 0.32));

  if (c.pattern === 'diagonal' && c.secondary) {
    return (
      <div
        className="flex items-center justify-center rounded-md font-bold leading-none tracking-tight ring-1 ring-border"
        style={{
          width: size,
          height: size,
          background: `linear-gradient(135deg, ${c.primary} 0%, ${c.primary} 50%, ${c.secondary} 50%, ${c.secondary} 100%)`,
          color: text,
          fontSize,
        }}
        aria-label={name}
      >
        {c.short}
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-center rounded-md font-bold leading-none tracking-tight ring-1 ring-border"
      style={{
        width: size,
        height: size,
        background: c.primary,
        color: text,
        fontSize,
      }}
      aria-label={name}
    >
      {c.short}
    </div>
  );
}

/* ---------- mockups ---------- */

function MockShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl border border-border bg-surface/80 p-4 shadow-2xl backdrop-blur">
      <div className="mb-3 flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
      </div>
      {children}
    </div>
  );
}

function MatchCard({
  competition,
  home,
  away,
  homeScore,
  awayScore,
  status,
  venue,
  live,
}: {
  competition: string;
  home: string;
  away: string;
  homeScore?: number;
  awayScore?: number;
  status: string;
  venue: string;
  live?: boolean;
}) {
  const homeColor = TEAMS[home]?.primary ?? 'var(--sf-color-border)';
  const awayColor = TEAMS[away]?.primary ?? 'var(--sf-color-border)';
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-bg/60 p-4">
      <div
        className="absolute inset-x-0 top-0 h-0.5"
        style={{
          background: `linear-gradient(90deg, ${homeColor} 0%, ${homeColor} 50%, ${awayColor} 50%, ${awayColor} 100%)`,
        }}
      />
      <div className="flex items-center gap-2">
        <CompetitionBadge name={competition} size={16} />
        <span className="text-[10px] uppercase tracking-wider text-muted">
          {competition}
        </span>
        {live ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-accent/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">
            <span className="h-1 w-1 animate-pulse rounded-full bg-accent" />
            Live
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <TeamCrest team={home} size={28} />
          <span className="truncate text-sm font-semibold">{home}</span>
        </div>
        <span className="shrink-0 text-base font-bold tabular-nums text-text">
          {homeScore !== undefined && awayScore !== undefined
            ? `${homeScore} – ${awayScore}`
            : status}
        </span>
        <div className="flex min-w-0 items-center justify-end gap-2">
          <span className="truncate text-sm font-semibold">{away}</span>
          <TeamCrest team={away} size={28} />
        </div>
      </div>
      <div className="mt-2 text-xs text-muted">{venue}</div>
    </div>
  );
}

function HeroMockup() {
  return (
    <MockShell>
      <div className="grid gap-3 md:grid-cols-3">
        <MatchCard
          competition="Premier League"
          home="Arsenal"
          away="Chelsea"
          homeScore={2}
          awayScore={1}
          status="FT"
          venue="Today · Emirates"
          live
        />
        <MatchCard
          competition="La Liga"
          home="Barcelona"
          away="Real Madrid"
          status="20:00"
          venue="Tomorrow · Camp Nou"
        />
        <div className="relative overflow-hidden rounded-lg border border-border bg-bg/60 p-4">
          <div
            className="absolute inset-x-0 top-0 h-0.5"
            style={{ background: TEAMS['Arsenal']!.primary }}
          />
          <div className="flex items-center gap-2">
            <TeamCrest team="Arsenal" size={20} />
            <span className="text-[10px] uppercase tracking-wider text-muted">
              Brief · 30s read
            </span>
          </div>
          <div className="mt-3 text-sm font-semibold leading-snug">
            Saka returns to full training ahead of Madrid tie.
          </div>
          <div className="mt-2 text-xs text-muted">Arsenal · 2h ago</div>
        </div>
      </div>
    </MockShell>
  );
}

function WatchlistMockup() {
  const teams: { name: string; league: string; followed: boolean }[] = [
    { name: 'Arsenal', league: 'Premier League', followed: true },
    { name: 'Real Madrid', league: 'La Liga', followed: true },
    { name: 'Inter Milan', league: 'Serie A', followed: false },
    { name: 'Bayern München', league: 'Bundesliga', followed: false },
  ];
  return (
    <MockShell>
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
        {teams.map((t) => (
          <li
            key={t.name}
            className="flex items-center justify-between rounded-md border border-border bg-bg/60 px-3 py-2"
          >
            <div className="flex items-center gap-3">
              <TeamCrest team={t.name} size={32} />
              <div>
                <div className="text-sm font-semibold">{t.name}</div>
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <CompetitionBadge name={t.league} size={12} />
                  {t.league}
                </div>
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                t.followed
                  ? 'bg-accent text-bg'
                  : 'border border-border text-muted'
              }`}
            >
              {t.followed ? 'Following' : 'Follow'}
            </span>
          </li>
        ))}
      </ul>
    </MockShell>
  );
}

function ScheduleMockup() {
  const fixtures = [
    {
      day: 'Sat',
      date: '22',
      home: 'Arsenal',
      away: 'Liverpool',
      time: '17:30',
      comp: 'Premier League',
    },
    {
      day: 'Sun',
      date: '23',
      home: 'Real Madrid',
      away: 'Barcelona',
      time: '20:00',
      comp: 'La Liga',
    },
    {
      day: 'Tue',
      date: '25',
      home: 'Man City',
      away: 'PSG',
      time: '21:00',
      comp: 'UEFA Champions League',
    },
  ];
  return (
    <MockShell>
      <ul className="space-y-2">
        {fixtures.map((f) => (
          <li
            key={`${f.home}-${f.away}`}
            className="flex items-center gap-3 rounded-md border border-border bg-bg/60 px-3 py-2"
          >
            <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-surface text-center">
              <span className="text-[10px] uppercase tracking-wider text-muted">
                {f.day}
              </span>
              <span className="text-sm font-bold leading-none">{f.date}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <CompetitionBadge name={f.comp} size={12} />
                <span className="text-[10px] uppercase tracking-wider text-muted">
                  {f.comp} · {f.time}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <TeamCrest team={f.home} size={20} />
                <span className="text-sm font-semibold">{f.home}</span>
                <span className="text-xs text-muted">vs</span>
                <span className="text-sm font-semibold">{f.away}</span>
                <TeamCrest team={f.away} size={20} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </MockShell>
  );
}

function BriefsMockup() {
  type Brief =
    | { kind: 'team'; team: string; title: string }
    | { kind: 'comp'; comp: string; title: string };

  const briefs: Brief[] = [
    {
      kind: 'team',
      team: 'Arsenal',
      title: 'Saka returns to full training ahead of Madrid tie.',
    },
    {
      kind: 'comp',
      comp: 'La Liga',
      title: 'Bellingham extends scoring streak to seven.',
    },
    {
      kind: 'team',
      team: 'Inter Milan',
      title: 'Inter close to deal for free-agent striker.',
    },
  ];
  return (
    <MockShell>
      <ul className="space-y-2">
        {briefs.map((b, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-md border border-border bg-bg/60 px-3 py-3"
          >
            {b.kind === 'team' ? (
              <TeamCrest team={b.team} size={32} />
            ) : (
              <CompetitionBadge name={b.comp} size={32} />
            )}
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-accent">
                {b.kind === 'team' ? b.team : b.comp}
              </span>
              <div className="mt-0.5 text-sm font-semibold leading-snug">
                {b.title}
              </div>
              <div className="mt-1 text-xs text-muted">30s read · 2h ago</div>
            </div>
          </li>
        ))}
      </ul>
    </MockShell>
  );
}

function NotificationsMockup() {
  type Item =
    | { kind: 'digest'; title: string; body: string }
    | {
        kind: 'kickoff';
        home: string;
        away: string;
        title: string;
        body: string;
      }
    | { kind: 'form'; team: string; title: string; body: string };

  const items: Item[] = [
    {
      kind: 'digest',
      title: 'Daily digest is ready',
      body: '6 stories across your teams.',
    },
    {
      kind: 'kickoff',
      home: 'Arsenal',
      away: 'Liverpool',
      title: 'Kick-off in 15 min',
      body: 'Arsenal vs Liverpool · Anfield.',
    },
    {
      kind: 'form',
      team: 'Real Madrid',
      title: 'Form alert',
      body: 'Real Madrid on a 5-match win streak.',
    },
  ];
  return (
    <MockShell>
      <ul className="space-y-2">
        {items.map((n, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-md border border-border bg-bg/60 px-3 py-2.5"
          >
            {n.kind === 'digest' ? (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                <svg
                  viewBox="0 0 16 16"
                  className="h-4 w-4"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M3 4h10v1.5H3V4Zm0 3.25h10v1.5H3v-1.5Zm0 3.25h7V12H3v-1.5Z" />
                </svg>
              </span>
            ) : n.kind === 'kickoff' ? (
              <div className="flex shrink-0 -space-x-2">
                <TeamCrest team={n.home} size={28} />
                <TeamCrest team={n.away} size={28} />
              </div>
            ) : (
              <TeamCrest team={n.team} size={28} />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{n.title}</div>
              <div className="text-xs text-muted">{n.body}</div>
            </div>
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
          </li>
        ))}
      </ul>
    </MockShell>
  );
}
