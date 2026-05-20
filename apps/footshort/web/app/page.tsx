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
            {[
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
            ].map((name) => (
              <div
                key={name}
                className="rounded-lg border border-border bg-surface/60 px-4 py-3 text-center text-sm font-medium text-text backdrop-blur"
              >
                {name}
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

function HeroMockup() {
  return (
    <MockShell>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-bg/60 p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted">
            Today · Premier League
          </div>
          <div className="mt-3 flex items-center justify-between text-sm font-semibold">
            <span>Arsenal</span>
            <span className="text-accent">2 : 1</span>
            <span>Chelsea</span>
          </div>
          <div className="mt-2 text-xs text-muted">Full time · Emirates</div>
        </div>
        <div className="rounded-lg border border-border bg-bg/60 p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted">
            Tomorrow · La Liga
          </div>
          <div className="mt-3 flex items-center justify-between text-sm font-semibold">
            <span>Barcelona</span>
            <span className="text-muted">20:00</span>
            <span>Real Madrid</span>
          </div>
          <div className="mt-2 text-xs text-muted">El Clásico · Camp Nou</div>
        </div>
        <div className="rounded-lg border border-border bg-bg/60 p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted">
            Brief · 30s read
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
  const teams = [
    { name: 'Arsenal', league: 'Premier League', followed: true },
    { name: 'Real Madrid', league: 'La Liga', followed: true },
    { name: 'Inter Milan', league: 'Serie A', followed: false },
    { name: 'Bayern München', league: 'Bundesliga', followed: false },
  ];
  return (
    <MockShell>
      <div className="mb-3 rounded-md border border-border bg-bg/60 px-3 py-2 text-xs text-muted">
        Search teams, leagues…
      </div>
      <ul className="space-y-2">
        {teams.map((t) => (
          <li
            key={t.name}
            className="flex items-center justify-between rounded-md border border-border bg-bg/60 px-3 py-2"
          >
            <div>
              <div className="text-sm font-semibold">{t.name}</div>
              <div className="text-xs text-muted">{t.league}</div>
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
    { day: 'Sat', date: '22', home: 'Arsenal', away: 'Liverpool', time: '17:30' },
    { day: 'Sun', date: '23', home: 'Real Madrid', away: 'Barcelona', time: '20:00' },
    { day: 'Tue', date: '25', home: 'Man City', away: 'PSG', time: '21:00' },
  ];
  return (
    <MockShell>
      <ul className="space-y-2">
        {fixtures.map((f) => (
          <li
            key={`${f.home}-${f.away}`}
            className="flex items-center gap-3 rounded-md border border-border bg-bg/60 px-3 py-2"
          >
            <div className="flex h-10 w-10 flex-col items-center justify-center rounded-md bg-surface text-center">
              <span className="text-[10px] uppercase tracking-wider text-muted">
                {f.day}
              </span>
              <span className="text-sm font-bold leading-none">{f.date}</span>
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">
                {f.home} <span className="text-muted">vs</span> {f.away}
              </div>
              <div className="text-xs text-muted">UCL · {f.time}</div>
            </div>
          </li>
        ))}
      </ul>
    </MockShell>
  );
}

function BriefsMockup() {
  const briefs = [
    { tag: 'Arsenal', title: 'Saka returns to full training ahead of Madrid tie.' },
    { tag: 'La Liga', title: 'Bellingham extends scoring streak to seven.' },
    { tag: 'Transfer', title: 'Inter close to deal for free-agent striker.' },
  ];
  return (
    <MockShell>
      <ul className="space-y-2">
        {briefs.map((b) => (
          <li
            key={b.title}
            className="rounded-md border border-border bg-bg/60 px-3 py-3"
          >
            <span className="text-[10px] font-medium uppercase tracking-wider text-accent">
              {b.tag}
            </span>
            <div className="mt-1 text-sm font-semibold leading-snug">
              {b.title}
            </div>
            <div className="mt-1 text-xs text-muted">30s read</div>
          </li>
        ))}
      </ul>
    </MockShell>
  );
}

function NotificationsMockup() {
  const items = [
    { title: 'Daily digest is ready', body: '6 stories across your teams.' },
    { title: 'Kick-off in 15 min', body: 'Arsenal vs Liverpool · Anfield.' },
    { title: 'Form alert', body: 'Real Madrid on a 5-match win streak.' },
  ];
  return (
    <MockShell>
      <ul className="space-y-2">
        {items.map((n) => (
          <li
            key={n.title}
            className="flex items-start gap-3 rounded-md border border-border bg-bg/60 px-3 py-2"
          >
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
            <div>
              <div className="text-sm font-semibold">{n.title}</div>
              <div className="text-xs text-muted">{n.body}</div>
            </div>
          </li>
        ))}
      </ul>
    </MockShell>
  );
}
