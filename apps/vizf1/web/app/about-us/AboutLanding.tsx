'use client'

import Link from 'next/link'
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  ArrowRight,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  ChartLineUp,
  Check,
  FlagCheckered,
  MagnifyingGlass,
  Newspaper,
  Play,
  Plus,
  Trophy,
} from '@phosphor-icons/react'
import type { RaceRow } from '@vismay/f1-viz/types'
import { findGrandPrix, flagUrl } from '@vismay/f1-viz/grands-prix'
import { F1_BRAND } from '@vizf1/brand'
import { ChequeredFlagMarkGradient, VF1MonogramFlat } from '@vizf1/brand/logos'
import { useAuth } from '@/lib/AuthProvider'
import { useAuthModal } from '@/lib/AuthModalProvider'
import { useSchedule } from '@/lib/useSchedule'
import { useConstructorStandings, useDriverStandings } from '@/lib/useStandings'
import { useAllConstructors, useAllDrivers } from '@/lib/useCatalog'
import { useNewsFeed, type NewsCard } from '@/lib/useNewsFeed'
import { raceDayLabel, raceStart, racesByStatus } from '@/lib/raceCalendar'
import { useCircuitGeometry } from '@/components/CircuitMap'
import { DriverAvatar } from '@/components/DriverAvatar'
import { StoryPlaceholder } from '@/components/StoryPlaceholder'

/* ---------- shared helpers ---------- */

function darken(hex: string, amount: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  const ch = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount))
  return `rgb(${ch(1)}, ${ch(3)}, ${ch(5)})`
}

function relativeTime(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function startsIn(race: RaceRow): string | null {
  const start = raceStart(race)
  if (!start) return null
  const ms = start.getTime() - Date.now()
  if (ms <= 0) return null
  const h = Math.floor(ms / 3_600_000)
  if (h < 24) return `in ${Math.max(h, 1)}h`
  return `in ${Math.floor(h / 24)}d`
}

// Flags come from an external CDN; drop the tile's flag rather than show a broken image.
function hideImage(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = 'none'
}

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'
function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia(reducedMotionQuery)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(reducedMotionQuery).matches,
    () => true,
  )
}

/**
 * Where "pick your drivers" should go. Logged-out visitors get the sign-in
 * modal in place (and are routed into onboarding once in); onboarded users can
 * only re-enter the picker through its edit mode.
 */
function usePickDrivers() {
  const { profile } = useAuth()
  const { requireAuth } = useAuthModal()
  const dest = profile?.onboarded_at ? '/onboarding/drivers?edit=1' : '/onboarding/drivers'
  return () => requireAuth(dest)
}

/* ---------- page ---------- */

export function AboutLanding() {
  // A returning, signed-in visitor shouldn't be asked to sign in again: they
  // get a "Go to the app" CTA that lands where the app would send them —
  // onboarding if unfinished, the For You feed otherwise.
  const { session, profile, loading } = useAuth()
  const { requireAuth } = useAuthModal()
  const pickDrivers = usePickDrivers()
  const isAuthed = !loading && !!session
  const appHref = session && profile && !profile.onboarded_at ? '/onboarding/drivers' : '/feed'

  return (
    <main className="relative min-h-screen overflow-hidden bg-bg font-sans text-text">
      <BackgroundGlow />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/feed" aria-label="VizF1" className="text-text">
          <VF1MonogramFlat className="h-6 w-auto sm:h-7" />
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-muted sm:flex">
          <a href="#features" className="hover:text-text">Features</a>
          <a href="#grid" className="hover:text-text">The grid</a>
          <a href="#weekend" className="hover:text-text">Race weekend</a>
        </nav>
        {isAuthed ? (
          <Link
            href={appHref}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-text shadow-[0_12px_30px_-10px_rgba(255,67,70,0.55)] transition hover:brightness-95 active:scale-[0.97]"
          >
            Go to the app
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => requireAuth('/feed')}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-text shadow-[0_12px_30px_-10px_rgba(255,67,70,0.55)] transition hover:brightness-95 active:scale-[0.97]"
          >
            Sign in
          </button>
        )}
      </header>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-12 pt-16 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 wdth-kicker text-[11px] font-bold uppercase tracking-[0.14em] text-accent backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            {new Date().getFullYear()} season · Live data
          </span>
          <h1 className="mt-6 wdth-display text-5xl font-bold uppercase leading-[0.95] tracking-[-0.02em] sm:text-7xl md:text-8xl">
            Formula 1,
            <br />
            <em className="not-italic text-accent">told in data.</em>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-muted sm:text-lg">
            Standings, race weekends, telemetry replays and the day&apos;s paddock news — for the
            drivers and teams you actually follow, in one fast feed.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={isAuthed ? appHref : '/feed'}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-base font-semibold text-accent-text shadow-[0_12px_30px_-10px_rgba(255,67,70,0.55)] transition hover:brightness-95 active:scale-[0.97] sm:w-auto"
            >
              {isAuthed ? 'Go to the app' : 'Open the app'}
              <ArrowRight size={18} weight="bold" />
            </Link>
            {!isAuthed ? (
              <button
                type="button"
                onClick={pickDrivers}
                className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-surface px-6 py-3 text-base font-medium text-text transition hover:border-muted sm:w-auto"
              >
                Create an account
              </button>
            ) : null}
          </div>
          {!isAuthed ? (
            <p className="mt-3 text-xs text-muted">Free to browse — no account needed to look around.</p>
          ) : null}
        </div>

        <div className="relative mx-auto mt-16 max-w-6xl">
          <div className="absolute inset-x-10 -bottom-6 h-24 rounded-full bg-accent/15 blur-3xl" />
          <div className="relative">
            <RaceCarousel />
          </div>
        </div>
      </section>

      <section id="features" className="relative z-10 mx-auto max-w-6xl scroll-mt-8 px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-2xl text-center">
          <span className="wdth-kicker text-xs font-bold uppercase tracking-[0.14em] text-accent">
            Why VizF1
          </span>
          <h2 className="mt-3 wdth-display text-4xl font-bold uppercase tracking-[-0.02em] sm:text-5xl">
            More than a timing screen.
          </h2>
          <p className="mt-4 text-muted">
            Everything you want between lights out and the chequered flag, nothing you don&apos;t.
          </p>
        </div>

        <div className="mt-20 space-y-24">
          <FeatureRow
            label="Step 01 — Follow"
            title="Your drivers. Your teams."
            body="Pick the drivers and constructors you care about. Their stories lead your feed, ringed at the top like a pit wall of your own."
            visual={<FollowPreview />}
          />
          <FeatureRow
            reverse
            label="Step 02 — Championship"
            title="The season, at a glance."
            body="Live driver and constructor standings, recomputed from every race and sprint result — plus position-over-time charts for the whole grid."
            visual={<StandingsPreview />}
          />
          <FeatureRow
            label="Step 03 — Stories"
            title="Swipe through the paddock."
            body="Headlines from across the F1 press, summarised into cards you can flick through between sessions. Every story tagged to the drivers and teams in it."
            visual={<NewsCardStack />}
          />
          <FeatureRow
            reverse
            label="Step 04 — Replay"
            title="Rewatch every lap."
            body="Race replays rebuilt from real car positions, with lap-by-lap timing and telemetry traces — speed, throttle and brake — for the moments that decided it."
            visual={<ReplayPreview />}
          />
        </div>
      </section>

      <section id="grid" className="relative z-10 scroll-mt-8 border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <span className="wdth-kicker text-xs font-bold uppercase tracking-[0.14em] text-accent">
              The grid
            </span>
            <h2 className="mt-3 wdth-display text-4xl font-bold uppercase tracking-[-0.02em] sm:text-5xl">
              Every team. Every driver.
            </h2>
            <p className="mt-4 text-muted">
              All {new Date().getFullYear()} constructors, ordered by the championship — tap one for
              its season in numbers.
            </p>
          </div>
          <TeamGrid />
        </div>
      </section>

      <section id="weekend" className="relative z-10 scroll-mt-8 border-t border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <span className="wdth-kicker text-xs font-bold uppercase tracking-[0.14em] text-accent">
              Built for race weekend
            </span>
            <h2 className="mt-3 wdth-display text-4xl font-bold uppercase tracking-[-0.02em] sm:text-5xl">
              Friday to flag.
            </h2>
            <p className="mt-4 text-muted">
              From the first practice lap to the last word on the result.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <WeekendCard
              icon={<CalendarBlank size={22} weight="duotone" />}
              title="In your timezone"
              body="Every session of the calendar, shown in your local time, with sprint weekends flagged."
              href="/feed#calendar"
              cta="See the calendar"
            />
            <WeekendCard
              icon={<ChartLineUp size={22} weight="duotone" />}
              title="Charts that explain"
              body="Position changes, gaps and pace — the race told as data, not just a results table."
              href="/feed"
              cta="Open For You"
            />
            <WeekendCard
              icon={<Newspaper size={22} weight="duotone" />}
              title="Editorial deep-dives"
              body="Long-form, scroll-driven data stories from the Vizmaya newsroom on the questions that matter."
              href="/editorial"
              cta="Read Editorial"
            />
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-4xl px-6 py-24">
        <div className="relative overflow-hidden rounded-[28px] border border-border bg-surface/60 px-8 py-16 text-center backdrop-blur sm:px-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                'repeating-linear-gradient(135deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 22px)',
            }}
          />
          <div className="absolute inset-x-0 -top-20 mx-auto h-40 w-40 rounded-full bg-accent/30 blur-3xl" />
          <div className="relative flex justify-center text-accent">
            <ChequeredFlagMarkGradient className="h-14 w-auto" />
          </div>
          <h2 className="relative mt-6 wdth-display text-4xl font-bold uppercase tracking-[-0.02em] sm:text-5xl">
            Lights out.
          </h2>
          <p className="relative mt-4 text-muted">
            {isAuthed
              ? 'Pick up where you left off — your drivers are waiting.'
              : 'Free to browse. Sign in to follow your drivers and teams.'}
          </p>
          <div className="relative mt-8 flex justify-center">
            {isAuthed ? (
              <Link
                href={appHref}
                className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3 text-base font-semibold text-accent-text shadow-[0_12px_30px_-10px_rgba(255,67,70,0.55)] transition hover:brightness-95 active:scale-[0.97]"
              >
                Go to the app
              </Link>
            ) : (
              <button
                type="button"
                onClick={pickDrivers}
                className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3 text-base font-semibold text-accent-text shadow-[0_12px_30px_-10px_rgba(255,67,70,0.55)] transition hover:brightness-95 active:scale-[0.97]"
              >
                Sign in to VizF1
              </button>
            )}
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <VF1MonogramFlat className="h-6 w-auto text-text" />
              <p className="mt-3 text-sm text-muted">
                Data journalism for Formula 1. The race, told in numbers.
              </p>
            </div>
            <FooterColumn
              heading="Product"
              links={[
                { label: 'Features', href: '#features' },
                { label: 'The grid', href: '#grid' },
                { label: 'Race weekend', href: '#weekend' },
              ]}
            />
            <FooterColumn
              heading="App"
              links={[
                { label: 'For you', href: '/feed' },
                { label: 'Discover', href: '/discover' },
                { label: 'Editorial', href: '/editorial' },
              ]}
            />
            <FooterColumn
              heading="Account"
              links={[
                { label: 'Sign in', href: '/login?next=/following' },
                { label: 'Create account', href: '/login' },
              ]}
            />
          </div>
          <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-border pt-6 text-xs text-muted sm:flex-row sm:items-center">
            <span>© {new Date().getFullYear()} VizF1 · A Vismay app</span>
            <span>Not affiliated with Formula 1 or the FIA.</span>
          </div>
        </div>
      </footer>
    </main>
  )
}

/* ---------- layout primitives ---------- */

function BackgroundGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* Faint chequer wash fading out down the page. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'conic-gradient(from 90deg at 1px 1px, transparent 25%, #fff 0 50%, transparent 0 75%, #fff 0)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(120% 70% at 50% 0%, black 25%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(120% 70% at 50% 0%, black 25%, transparent 75%)',
        }}
      />
      <div className="absolute left-1/2 top-[-20%] h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
      <div className="absolute left-[8%] top-[30%] h-[20rem] w-[20rem] rounded-full bg-accent/[0.05] blur-3xl" />
    </div>
  )
}

function FeatureRow({
  label,
  title,
  body,
  visual,
  reverse,
}: {
  label: string
  title: string
  body: string
  visual: React.ReactNode
  reverse?: boolean
}) {
  return (
    <div className={`grid items-center gap-10 md:grid-cols-2 ${reverse ? 'md:[&>:first-child]:order-2' : ''}`}>
      <div>
        <span className="wdth-kicker text-xs font-bold uppercase tracking-[0.14em] text-accent">{label}</span>
        <h3 className="mt-3 wdth-display text-4xl font-bold uppercase tracking-[-0.02em] sm:text-5xl">
          {title}
        </h3>
        <p className="mt-4 text-base text-muted sm:text-lg">{body}</p>
      </div>
      <div className="min-w-0">{visual}</div>
    </div>
  )
}

function FooterColumn({ heading, links }: { heading: string; links: { label: string; href: string }[] }) {
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
  )
}

function WeekendCard({
  icon,
  title,
  body,
  href,
  cta,
}: {
  icon: React.ReactNode
  title: string
  body: string
  href: string
  cta: string
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[210px] flex-col justify-between rounded-[20px] border border-border bg-bg p-6 transition duration-200 hover:-translate-y-0.5 hover:border-muted"
    >
      <div>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
          {icon}
        </span>
        <h3 className="mt-5 text-xl font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted">{body}</p>
      </div>
      <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-text group-hover:text-accent">
        {cta}
        <ArrowRight size={14} weight="bold" />
      </span>
    </Link>
  )
}

function PreviewLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1 wdth-kicker text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-accent">{icon}</span>
      {children}
    </div>
  )
}

function CarouselButton({
  dir,
  disabled,
  onClick,
  label,
}: {
  dir: 'prev' | 'next'
  disabled?: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text transition hover:border-muted disabled:opacity-35 disabled:hover:border-border"
    >
      {dir === 'prev' ? <CaretLeft size={16} weight="bold" /> : <CaretRight size={16} weight="bold" />}
    </button>
  )
}

/* ---------- hero: race weekend carousel ---------- */

function RaceCarousel() {
  const { data: races = [], isLoading } = useSchedule()
  const rail = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: true })

  // The race to open on: whatever's live, else the next one up, else the
  // season finale. Its card is scrolled into view with one race of context.
  const focusIndex = useMemo(() => {
    const live = races.findIndex((r) => r.status === 'live')
    if (live !== -1) return live
    const next = races.findIndex((r) => r.status === 'upcoming')
    return next !== -1 ? next : races.length - 1
  }, [races])
  const nextUpId = races[focusIndex]?.status === 'upcoming' ? races[focusIndex]!.id : null

  useEffect(() => {
    const el = rail.current
    if (!el || races.length === 0) return
    const update = () =>
      setEdges({
        start: el.scrollLeft < 2,
        end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
      })
    const cards = el.querySelectorAll<HTMLElement>('[data-race-card]')
    const anchor = cards[Math.max(focusIndex - 1, 0)]
    // The rail is `relative`, so offsetLeft is already rail-relative; 24px = px-6.
    if (anchor) el.scrollLeft = anchor.offsetLeft - 24
    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [races.length, focusIndex])

  const scroll = (dir: 1 | -1) => {
    const el = rail.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, 240), behavior: 'smooth' })
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <PreviewLabel icon={<FlagCheckered size={12} weight="fill" />}>
          Race weekends · {new Date().getFullYear()}
        </PreviewLabel>
        <div className="flex gap-2">
          <CarouselButton dir="prev" label="Earlier races" disabled={edges.start} onClick={() => scroll(-1)} />
          <CarouselButton dir="next" label="Later races" disabled={edges.end} onClick={() => scroll(1)} />
        </div>
      </div>
      <div
        ref={rail}
        className="relative -mx-6 flex snap-x snap-mandatory scroll-px-6 gap-3 overflow-x-auto px-6 pb-3 [mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-48px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {isLoading || races.length === 0
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 w-60 shrink-0 animate-pulse rounded-2xl border border-border bg-surface" />
            ))
          : races.map((r) => <RaceTile key={r.id} race={r} nextUp={r.id === nextUpId} />)}
      </div>
    </div>
  )
}

function RaceTile({ race, nextUp }: { race: RaceRow; nextUp: boolean }) {
  const gp = findGrandPrix(race.raceName)
  const canceled = race.status === 'canceled'
  const countdown = nextUp ? startsIn(race) : null
  return (
    <Link
      data-race-card
      href={`/race/${race.round}`}
      className={`group relative flex h-44 w-60 shrink-0 snap-start flex-col justify-between overflow-hidden rounded-2xl border p-4 transition hover:-translate-y-0.5 ${
        nextUp || race.status === 'live'
          ? 'border-accent bg-accent/10 shadow-[inset_0_-3px_var(--color-accent)]'
          : 'border-border bg-surface hover:border-muted'
      }`}
    >
      <div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] text-muted">R{String(race.round).padStart(2, '0')}</span>
          {gp ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={flagUrl(gp.code, 80)} alt="" width={24} height={16} className="h-4 w-6 rounded-[2px] object-cover" onError={hideImage} />
          ) : null}
        </div>
        <div
          className={`mt-3 wdth-display text-2xl font-bold uppercase leading-none tracking-[-0.01em] ${
            canceled ? 'text-muted line-through' : ''
          }`}
        >
          {race.raceName.replace(/ Grand Prix$/, '')}
        </div>
        <div className="mt-1.5 truncate text-xs text-muted">
          {race.circuitName || race.locality || race.country}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-text">{raceDayLabel(race, { day: 'numeric', month: 'short' })}</span>
        <div className="flex items-center gap-1.5">
          {race.hasSprint ? (
            <span className="rounded-full border border-border px-2 py-0.5 wdth-kicker text-[10px] font-semibold uppercase tracking-wider text-muted">
              Sprint
            </span>
          ) : null}
          <RaceStatusChip race={race} nextUp={nextUp} countdown={countdown} />
        </div>
      </div>
    </Link>
  )
}

function RaceStatusChip({ race, nextUp, countdown }: { race: RaceRow; nextUp: boolean; countdown: string | null }) {
  const base = 'rounded-full px-2 py-0.5 wdth-kicker text-[10px] font-bold uppercase tracking-wider'
  if (race.status === 'live')
    return (
      <span className={`${base} inline-flex items-center gap-1 bg-accent text-accent-text`}>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-text" />
        Live
      </span>
    )
  if (race.status === 'finished')
    return (
      <span className={`${base} inline-flex items-center gap-1 border border-border text-muted`}>
        <Check size={10} weight="bold" />
        Done
      </span>
    )
  if (race.status === 'canceled') return <span className={`${base} border border-border text-muted`}>Canceled</span>
  if (nextUp) return <span className={`${base} bg-accent text-accent-text`}>{countdown ?? 'Up next'}</span>
  return <span className={`${base} border border-border text-muted`}>Upcoming</span>
}

/* ---------- feature visuals (fed by real, public data) ---------- */

function FollowPreview() {
  const standings = useDriverStandings()
  const catalog = useAllDrivers()
  const pickDrivers = usePickDrivers()
  const drivers = (standings.data?.length
    ? standings.data.map((d) => ({
        id: d.driverId,
        name: d.driverName,
        code: d.driverCode,
        headshotUrl: d.headshotUrl,
        color: d.constructorColor,
        sub: d.constructorName,
      }))
    : (catalog.data ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        code: d.code,
        headshotUrl: d.headshotUrl,
        color: d.primaryColor,
        sub: d.code ?? '',
      }))
  ).slice(0, 5)
  const loading = standings.isLoading || (catalog.isLoading && !standings.data?.length)

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-2xl">
      <button
        type="button"
        onClick={pickDrivers}
        className="mb-3 flex w-full items-center gap-2 rounded-md border border-border bg-bg/60 px-3 py-2 text-left text-xs text-muted hover:border-muted"
      >
        <MagnifyingGlass size={14} />
        Search drivers, teams…
      </button>
      <ul className="space-y-2">
        {loading || drivers.length === 0
          ? Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 rounded-md border border-border bg-bg/60 px-3 py-2">
                <div className="h-9 w-9 animate-pulse rounded-full bg-surface" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 animate-pulse rounded bg-surface" />
                  <div className="h-2.5 w-20 animate-pulse rounded bg-surface" />
                </div>
              </li>
            ))
          : drivers.map((d, i) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg/60 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <DriverAvatar name={d.name} code={d.code} headshotUrl={d.headshotUrl} accent={d.color} size="sm" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-text">{d.name}</div>
                    <div className="truncate text-xs text-muted">{d.sub}</div>
                  </div>
                </div>
                {/* Following someone needs an account — the chip asks for one in place. */}
                <button
                  type="button"
                  onClick={pickDrivers}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                    i < 2 ? 'bg-accent text-accent-text' : 'border border-border text-muted hover:text-text'
                  }`}
                >
                  {i < 2 ? <Check size={12} weight="bold" /> : <Plus size={12} weight="bold" />}
                  {i < 2 ? 'Following' : 'Follow'}
                </button>
              </li>
            ))}
      </ul>
    </div>
  )
}

function StandingsPreview() {
  const [tab, setTab] = useState<'drivers' | 'constructors'>('drivers')
  const drivers = useDriverStandings()
  const constructors = useConstructorStandings()

  const rows =
    tab === 'drivers'
      ? (drivers.data ?? []).slice(0, 6).map((d) => ({
          id: d.driverId,
          position: d.position,
          label: d.driverCode ?? d.driverName,
          sub: d.driverName,
          color: d.constructorColor ?? F1_BRAND.colors.muted,
          points: d.points,
          href: `/driver/${d.driverId}`,
        }))
      : (constructors.data ?? []).slice(0, 6).map((c) => ({
          id: c.constructorId,
          position: c.position,
          label: c.constructorName,
          sub: `${c.wins} ${c.wins === 1 ? 'win' : 'wins'}`,
          color: c.primaryColor ?? F1_BRAND.colors.muted,
          points: c.points,
          href: `/team/${c.constructorId}`,
        }))
  const loading = tab === 'drivers' ? drivers.isLoading : constructors.isLoading
  const max = Math.max(rows[0]?.points ?? 0, 1)

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PreviewLabel icon={<Trophy size={12} weight="fill" />}>Championship</PreviewLabel>
        <div className="inline-flex rounded-full border border-border bg-bg/60 p-0.5" role="tablist">
          {(['drivers', 'constructors'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                tab === t ? 'bg-accent font-semibold text-accent-text' : 'text-muted hover:text-text'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <ol className="mt-5 space-y-3">
        {loading || rows.length === 0
          ? Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3">
                <div className="h-3 w-4 animate-pulse rounded bg-bg" />
                <div className="h-6 flex-1 animate-pulse rounded bg-bg" style={{ maxWidth: `${90 - i * 12}%` }} />
              </li>
            ))
          : rows.map((r, i) => (
              <li key={`${tab}-${r.id}`}>
                <Link href={r.href} className="group flex items-center gap-3">
                  <span className="w-5 shrink-0 text-right font-mono text-xs text-muted">{r.position}</span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-text group-hover:text-accent">
                        {r.label}
                        <span className="ml-2 text-xs font-normal text-muted">{r.sub !== r.label ? r.sub : ''}</span>
                      </span>
                      <span className="shrink-0 font-mono text-sm text-text">
                        {r.points}
                        <span className="ml-1 text-[10px] text-muted">PTS</span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                      <div
                        className="vf-bar-grow h-full origin-left rounded-full"
                        style={{
                          width: `${Math.max((r.points / max) * 100, 2)}%`,
                          background: r.color,
                          animation: `vf-bar-grow 0.9s cubic-bezier(.2,.8,.2,1) ${i * 70}ms both`,
                        }}
                      />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
      </ol>
      {!loading && rows.length === 0 ? (
        <p className="mt-2 text-center text-xs text-muted">Standings appear after the first race.</p>
      ) : null}
    </div>
  )
}

function NewsCardStack() {
  const { data: stories = [], isLoading } = useNewsFeed(6)
  const [index, setIndex] = useState(0)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)

  if (isLoading || stories.length === 0) {
    return (
      <div className="relative mx-auto h-[440px] max-w-sm">
        <div className="absolute inset-0 animate-pulse rounded-3xl border border-border bg-surface shadow-2xl" />
      </div>
    )
  }

  const total = stories.length
  const advance = (dir: 1 | -1) => setIndex((prev) => (prev + dir + total) % total)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(true)
    startX.current = e.clientX
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    setDragX(e.clientX - startX.current)
  }
  const finishDrag = () => {
    if (!dragging) return
    setDragging(false)
    if (dragX > 80) advance(-1)
    else if (dragX < -80) advance(1)
    setDragX(0)
  }

  // Front card + two peeking behind, rendered back-to-front so DOM order
  // matches stacking order.
  const visible: { story: NewsCard; depth: number }[] = []
  for (let depth = Math.min(2, total - 1); depth >= 0; depth--) {
    visible.push({ story: stories[(index + depth) % total]!, depth })
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative mx-auto h-[440px] w-full max-w-sm touch-pan-y select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        {visible.map(({ story, depth }) => (
          <StoryStackCard
            key={`${story.id}-${depth}`}
            story={story}
            depth={depth}
            dragX={depth === 0 ? dragX : 0}
            isDragging={dragging && depth === 0}
          />
        ))}
      </div>
      <div className="flex items-center justify-center gap-3">
        <CarouselButton dir="prev" label="Previous story" onClick={() => advance(-1)} />
        <span className="min-w-[3rem] text-center font-mono text-xs text-muted">
          {index + 1} / {total}
        </span>
        <CarouselButton dir="next" label="Next story" onClick={() => advance(1)} />
      </div>
      <Link href="/discover" className="inline-flex items-center gap-1.5 text-sm font-medium text-text hover:text-accent">
        Open Discover
        <ArrowRight size={14} weight="bold" />
      </Link>
    </div>
  )
}

function StoryStackCard({
  story,
  depth,
  dragX,
  isDragging,
}: {
  story: NewsCard
  depth: number
  dragX: number
  isDragging: boolean
}) {
  const translateY = depth * -12
  const transform =
    depth === 0
      ? `translate3d(${dragX}px, ${translateY}px, 0) rotate(${dragX * 0.04}deg)`
      : `translate3d(0, ${translateY}px, 0) scale(${1 - depth * 0.04})`

  return (
    <article
      className="absolute inset-0 flex flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl"
      style={{
        transform,
        opacity: 1 - depth * 0.3,
        zIndex: 10 - depth,
        transition: isDragging ? 'none' : 'transform 0.3s ease, opacity 0.3s ease',
        cursor: depth === 0 ? (isDragging ? 'grabbing' : 'grab') : 'default',
        pointerEvents: depth === 0 ? 'auto' : 'none',
      }}
    >
      <div className="relative aspect-[16/10] shrink-0 overflow-hidden bg-bg">
        {story.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={story.imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <StoryPlaceholder visual={story.visual} />
        )}
      </div>
      <div className="p-5">
        <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wider">
          <span className="rounded-full bg-accent px-2 py-0.5 font-semibold text-accent-text">{story.publisher}</span>
          <span className="text-muted">{relativeTime(story.publishedAt)}</span>
        </div>
        <h3 className="line-clamp-2 text-base font-semibold leading-snug text-text">{story.headline}</h3>
        {story.summary ? <p className="mt-2 line-clamp-3 text-sm text-muted">{story.summary}</p> : null}
      </div>
    </article>
  )
}

function ReplayPreview() {
  const { data: races = [] } = useSchedule()
  const race = racesByStatus(races, 'finished').at(-1) ?? null
  const geometry = useCircuitGeometry(race?.circuitId ?? '')
  const { data: constructors = [] } = useConstructorStandings()
  const reducedMotion = useReducedMotion()
  const pathId = useId()
  const d = geometry.data?.track_path_svg ?? null

  // Three cars in the top teams' colours chase each other round the outline.
  const cars = (
    constructors.length
      ? constructors.slice(0, 3).map((c) => c.primaryColor ?? F1_BRAND.colors.muted)
      : [F1_BRAND.constructors.mclaren, F1_BRAND.constructors.ferrari, F1_BRAND.constructors.mercedes]
  ) as string[]
  const gp = race ? findGrandPrix(race.raceName) : null

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <p className="wdth-kicker text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            {race ? `Round ${String(race.round).padStart(2, '0')} · Race replay` : 'Race replay'}
          </p>
          <p className="mt-1 truncate text-lg font-semibold">{race?.raceName ?? 'Latest Grand Prix'}</p>
        </div>
        {gp ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={flagUrl(gp.code, 80)} alt="" width={30} height={20} className="h-5 w-[30px] shrink-0 rounded-[2px] object-cover" onError={hideImage} />
        ) : null}
      </div>

      <div className="relative mx-5 mt-4 aspect-[4/3] rounded-xl border border-border bg-bg/60">
        {d ? (
          <svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet" className="h-full w-full p-4" aria-hidden>
            <path id={pathId} d={d} fill="none" stroke="var(--color-border)" strokeWidth={34} strokeLinecap="round" strokeLinejoin="round" />
            <path d={d} fill="none" stroke="var(--color-muted)" strokeOpacity={0.5} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
            {cars.map((color, i) => (
              <circle key={i} r={22} fill={color} stroke="var(--color-bg)" strokeWidth={6}>
                {reducedMotion ? null : (
                  <animateMotion dur="11s" begin={`${-i * 0.55}s`} repeatCount="indefinite" rotate="auto">
                    <mpath href={`#${pathId}`} />
                  </animateMotion>
                )}
              </circle>
            ))}
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="h-2/3 w-2/3 animate-pulse rounded-full border-[10px] border-surface" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 p-5">
        <Link
          href={race ? `/race/${race.round}/replay` : '/feed'}
          aria-label="Open the race replay"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-text transition hover:brightness-95 active:scale-95"
        >
          <Play size={16} weight="fill" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-bg">
            <div className="h-full w-[62%] rounded-full bg-accent" />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {['Positions', 'Lap times', 'Speed', 'Throttle', 'Brake'].map((c) => (
              <span key={c} className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- the grid ---------- */

function TeamGrid() {
  const standings = useConstructorStandings()
  const catalog = useAllConstructors()
  const teams = standings.data?.length
    ? standings.data.map((c) => ({
        id: c.constructorId,
        name: c.constructorName,
        color: c.primaryColor,
        logoUrl: c.logoUrl,
        stat: `P${c.position} · ${c.points} pts`,
      }))
    : (catalog.data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        color: c.primaryColor,
        logoUrl: c.logoUrl,
        stat: null as string | null,
      }))
  const loading = standings.isLoading || (catalog.isLoading && !standings.data?.length)

  if (loading) {
    return (
      <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-[4/3] animate-pulse rounded-xl border border-border bg-surface/60" />
        ))}
      </div>
    )
  }
  if (teams.length === 0) return null
  return (
    <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {teams.map((t) => (
        <TeamTile key={t.id} team={t} />
      ))}
    </div>
  )
}

function TeamTile({
  team,
}: {
  team: { id: string; name: string; color: string | null; logoUrl: string | null; stat: string | null }
}) {
  const base = team.color ?? F1_BRAND.constructors[team.id as keyof typeof F1_BRAND.constructors] ?? null
  const background = base
    ? `linear-gradient(135deg, ${base} 0%, ${darken(base, 0.6)} 100%)`
    : 'var(--color-surface)'
  // Bundled marks are white glyphs — always on the team tint, never on white.
  const logo = team.logoUrl ?? F1_BRAND.constructorLogos[team.id] ?? null

  return (
    <Link
      href={`/team/${team.id}`}
      className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border shadow-lg"
      style={{ background }}
    >
      <div className="flex h-full flex-col items-center p-4">
        <div className="flex min-h-0 flex-1 items-center justify-center">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt=""
              className="h-full max-h-16 w-auto max-w-[70%] object-contain transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <span className="wdth-display text-3xl font-bold uppercase text-white/90">{team.name.slice(0, 3)}</span>
          )}
        </div>
        <div className="w-full text-center">
          <div className="truncate text-sm font-bold leading-tight text-white">{team.name}</div>
          {team.stat ? <div className="truncate font-mono text-[11px] text-white/75">{team.stat}</div> : null}
        </div>
      </div>
    </Link>
  )
}
