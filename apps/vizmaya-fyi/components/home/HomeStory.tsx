'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import Link from 'next/link'
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  EnvelopeSimple,
  LinkedinLogo,
  Newspaper,
  XLogo,
  YoutubeLogo,
} from '@phosphor-icons/react'
import { StoryGridFonts, epicCardTheme } from '@vismay/ui'
import VizmayaLogo from '@/components/VizmayaLogo'
import { LiveRing } from '@/app/ai-daily/doom-v-boom/components/ScoreRing'
import {
  BRAND,
  HOME_VIEWS,
  HOME_VIEW_META,
  STUDIO,
  type HomeDailyEdition,
  type HomeData,
  type HomeEpic,
} from '@/lib/home/homeShape'
import { Chapter, CountUp, Kicker, PenroseMark, REVEAL, useReveal } from './bits'
import FrontPage, { VIEW_ICONS } from './FrontPage'
import { chooseHomeView } from './homeViewStore'

/**
 * The vizmaya.fyi home page, told as an HTML story: a masthead and a lede,
 * then chapters. Chapter I is the front page itself, swappable between a
 * Book, a Board and a Deck (the hosted story formats) with a plain Scroll as
 * the fallback; then the Doom v Boom daily, the epics, the studio and how to
 * work with it.
 */

const TOKENS = {
  '--ink': BRAND.ink,
  '--cream': BRAND.cream,
  '--paper': BRAND.paper,
  '--muted': BRAND.muted,
  '--line': 'rgba(12,12,16,.1)',
  '--line2': 'rgba(12,12,16,.18)',
  '--teal': BRAND.teal,
  '--pink': BRAND.pink,
  '--blue': BRAND.blue,
  '--serif': 'var(--font-fraunces), Georgia, serif',
  '--sans': 'var(--font-inter), -apple-system, "Segoe UI", sans-serif',
  '--mono': 'var(--font-jetbrains-mono), ui-monospace, monospace',
} as CSSProperties

const LOGO_PALETTE = {
  text: '#111111',
  teal: BRAND.teal,
  accent: BRAND.pink,
  accent2: BRAND.blue,
  surface: '#FFFFFF',
  muted: '#1D1D1D',
  line: '#111111',
}

// ── masthead ──────────────────────────────────────────────────────────────

function Masthead() {
  const bar = useRef<HTMLDivElement>(null)
  const nav = useRef<HTMLElement>(null)
  // Reading progress along the bottom of the bar, and a solid bar once scrolled.
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      const p = max > 0 ? window.scrollY / max : 0
      bar.current?.style.setProperty('transform', `scaleX(${p})`)
      nav.current?.toggleAttribute('data-scrolled', window.scrollY > 24)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  const links = [
    { href: '#front-page', label: 'Stories' },
    { href: '#daily', label: 'Daily' },
    { href: '#epics', label: 'Epics' },
    { href: '#studio', label: 'Studio' },
  ]
  return (
    <nav
      ref={nav}
      aria-label="vizmaya"
      className="fixed inset-x-0 top-0 z-50 border-b border-transparent transition-[background-color,border-color] duration-300 data-[scrolled]:border-(--line) data-[scrolled]:bg-[rgba(244,241,236,.88)] data-[scrolled]:backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-8">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Vizmaya Labs, back to the top"
          className="-ml-1 flex items-center"
        >
          <VizmayaLogo className="h-[38px] w-[150px] sm:h-[42px] sm:w-[170px]" palette={LOGO_PALETTE} />
        </button>
        <div className="flex items-center gap-6">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="hidden font-(family-name:--mono) text-[10px] uppercase tracking-[.18em] text-[rgba(12,12,16,.5)] transition-colors hover:text-(--ink) md:inline"
            >
              {l.label}
            </a>
          ))}
          <Link
            href="/stories"
            className="hidden font-(family-name:--mono) text-[10px] uppercase tracking-[.18em] text-[rgba(12,12,16,.5)] transition-colors hover:text-(--ink) sm:inline"
          >
            Archive
          </Link>
          <a
            href={STUDIO.youtube}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-[3px] bg-(--ink) px-4 py-2.5 font-(family-name:--mono) text-[10px] font-medium uppercase tracking-[.18em] text-(--cream) transition-opacity hover:opacity-90"
          >
            <YoutubeLogo size={15} weight="fill" aria-hidden /> Subscribe
          </a>
        </div>
      </div>
      <div aria-hidden className="h-[2px] w-full">
        <div ref={bar} className="h-full origin-left scale-x-0 bg-(--teal)" />
      </div>
    </nav>
  )
}

// ── the lede ──────────────────────────────────────────────────────────────

function Lede({ data, today }: { data: HomeData; today: string }) {
  const latest = data.dailyEditions[0]
  const stats = [
    { n: data.stories.length, label: 'stories published' },
    { n: data.epics.length, label: 'running epics' },
    ...(latest?.number ? [{ n: latest.number, label: 'mornings scored' }] : []),
    { n: 2, label: 'people' },
  ].filter((s) => s.n > 0)
  return (
    <header className="relative overflow-hidden px-4 pb-16 pt-32 sm:px-8 md:pb-24 md:pt-40">
      {/* the mark, large and faint, behind the lede */}
      <PenroseMark
        size={560}
        line="rgba(12,12,16,.08)"
        className="pointer-events-none absolute -right-40 top-16 hidden opacity-[.13] lg:block"
      />
      <div className="relative mx-auto max-w-[1180px]">
        <div data-reveal className={REVEAL}>
          <Kicker>{STUDIO.name} · The front page</Kicker>
        </div>
        <h1
          data-reveal
          className={`mt-7 max-w-[15ch] font-(family-name:--serif) text-[clamp(44px,7.6vw,108px)] font-semibold leading-[.95] tracking-[-.04em] text-balance ${REVEAL}`}
        >
          We turn complex data into stories{' '}
          <span className="relative text-(--teal) sm:whitespace-nowrap">
            impossible to ignore.
            <svg aria-hidden viewBox="0 0 300 12" preserveAspectRatio="none" className="absolute -bottom-[.08em] left-0 hidden h-[.12em] w-full sm:block">
              <path d="M2 8c60-6 140-8 296-3" fill="none" stroke="var(--pink)" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </span>
        </h1>
        <div data-reveal className={`mt-10 grid gap-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-16 ${REVEAL}`}>
          <div>
            <p className="max-w-[58ch] text-[clamp(18px,1.55vw,21px)] leading-[1.65] text-(--muted) first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:font-(family-name:--serif) first-letter:text-[64px] first-letter:font-semibold first-letter:leading-[.8] first-letter:text-(--ink)">
              {STUDIO.deck}
            </p>
            <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 font-(family-name:--mono) text-[10.5px] uppercase tracking-[.16em] text-(--muted)">
              <PenroseMark size={18} />
              <span>By the Vizmaya studio</span>
              <span aria-hidden>·</span>
              <span>Updated {today}</span>
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-6 self-start border-t border-(--line2) pt-6">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <CountUp value={s.n} className="block font-(family-name:--serif) text-[44px] font-semibold leading-none tracking-[-.03em]" />
                  <span className="mt-2 block font-(family-name:--mono) text-[10px] uppercase tracking-[.16em] text-(--muted)">{s.label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* choose a binding, then jump to it */}
        <div data-reveal className={`mt-14 ${REVEAL}`}>
          <p className="font-(family-name:--serif) text-[20px] font-medium">How would you like to read it?</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {HOME_VIEWS.map((v) => {
              const I = VIEW_ICONS[v]
              return (
                <a
                  key={v}
                  href="#front-page"
                  onClick={() => chooseHomeView(v)}
                  className="group flex flex-col gap-3 rounded-[10px] border border-(--line2) bg-(--paper) p-4 transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-(--ink) hover:shadow-[0_18px_40px_-24px_rgba(12,12,16,.45)]"
                >
                  <span className="flex items-center justify-between">
                    <I size={26} aria-hidden className="text-(--ink)" />
                    <ArrowDown size={14} aria-hidden className="text-(--muted) transition-transform group-hover:translate-y-0.5" />
                  </span>
                  <span className="font-(family-name:--serif) text-[22px] font-semibold leading-none">{HOME_VIEW_META[v].label}</span>
                  <span className="text-[13px] leading-[1.45] text-(--muted)">{HOME_VIEW_META[v].hint}</span>
                </a>
              )
            })}
          </div>
        </div>
      </div>
    </header>
  )
}

// ── chapter II: doom v boom ───────────────────────────────────────────────

function DailyEditions({ editions, vars }: { editions: HomeDailyEdition[]; vars: Record<string, string> }) {
  // The edition tokens under their own names for the ring (--boom, --doom,
  // --dim …) and --dv-* aliases for these cards, since the page already owns
  // --ink / --muted / --line.
  const style: Record<string, string> = {}
  for (const [k, v] of Object.entries(vars)) style[`--dv-${k.slice(2)}`] = v
  for (const k of ['--boom', '--doom', '--dim']) if (vars[k]) style[k] = vars[k]
  return (
    <div data-ring-palette="" style={style as CSSProperties} className="grid gap-4 md:grid-cols-3">
      {editions.map((e, i) => (
        <Link
          key={e.href}
          href={e.href}
          data-reveal
          data-tone={e.tone}
          className={`group flex min-h-[300px] flex-col gap-5 rounded-[10px] border border-(--dv-line) bg-(--dv-surface) p-6 text-(--dv-bone) transition-[border-color,box-shadow] hover:border-(--dv-accent) hover:shadow-[0_24px_50px_-24px_rgba(12,12,16,.6)] ${REVEAL}`}
        >
          <span className="flex justify-between font-(family-name:--mono) text-[9.5px] uppercase tracking-[.14em] text-(--dv-muted)">
            <span>{i === 0 ? `Latest · ${e.date}` : e.date}</span>
            {e.number != null && <span>No. {e.number}</span>}
          </span>
          <span className="flex items-center gap-4">
            <LiveRing score={e.moodScore} className="w-[108px] flex-none">
              <span className="font-(family-name:--serif) text-[30cqi] font-medium leading-none tracking-[-.02em] tabular-nums text-(--dv-bone)">
                {e.score ?? '—'}
              </span>
            </LiveRing>
            <span className="grid gap-1.5">
              <span className="font-(family-name:--mono) text-[9px] uppercase tracking-[.14em] text-(--dv-muted)">
                Boom Score{e.score != null ? ' / 100' : ''}
              </span>
              <span className="font-(family-name:--serif) text-[19px] leading-[1.15] text-(--dv-muted) group-data-[tone=boom]:text-(--dv-boom-ink) group-data-[tone=doom]:text-(--dv-doom-ink)">
                {e.word}
              </span>
              <span className="font-(family-name:--mono) text-[11px] text-(--dv-dim)">{e.signed}</span>
            </span>
          </span>
          <span className="font-(family-name:--serif) text-[19px] font-medium leading-[1.25] tracking-[-.01em] text-pretty">{e.headline}</span>
          <span className="mt-auto inline-flex items-center gap-2 font-(family-name:--mono) text-[9.5px] uppercase tracking-[.16em] text-(--dv-accent)">
            Read the edition <ArrowRight size={12} weight="bold" aria-hidden />
          </span>
        </Link>
      ))}
    </div>
  )
}

// ── chapter III: epics ────────────────────────────────────────────────────

function Epics({ epics }: { epics: HomeEpic[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {epics.map((e, i) => {
        const t = epicCardTheme(e.theme, i)
        return (
          <Link
            key={e.slug}
            href={`/${e.slug}`}
            data-reveal
            style={{ background: t.bg, color: t.text, '--ea': t.accent, '--em': t.muted } as CSSProperties}
            className={`group relative flex min-h-[240px] flex-col overflow-hidden rounded-[10px] p-6 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(12,12,16,.7)] ${REVEAL}`}
          >
            <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-(--ea)" />
            <span
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-(--ea) opacity-20 blur-3xl transition-opacity group-hover:opacity-35"
            />
            <span className="font-(family-name:--mono) text-[10px] uppercase tracking-[.18em] text-(--ea)">Epic · {String(i + 1).padStart(2, '0')}</span>
            <span className="mt-4 text-[28px] font-semibold leading-[1.05] tracking-[-.02em]" style={{ fontFamily: t.serif ?? 'var(--serif)' }}>
              {e.name}
            </span>
            {e.description && <span className="mt-3 line-clamp-3 text-[15px] leading-[1.55] text-(--em)">{e.description}</span>}
            <span className="mt-auto inline-flex items-center gap-2 pt-6 font-(family-name:--mono) text-[10px] uppercase tracking-[.18em]">
              Enter the collection <ArrowRight size={12} weight="bold" aria-hidden className="transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        )
      })}
    </div>
  )
}

// ── chapter IV: the studio ────────────────────────────────────────────────

const PROCESS = [
  { n: '01', title: 'A data brief', body: 'You bring findings worth publishing. We read the data the way a sceptical reader would.' },
  { n: '02', title: 'An editorial call', body: 'We agree the argument, the evidence and the one chart that carries it.' },
  { n: '03', title: 'Two to four weeks', body: 'Maps, charts and prose, built to travel: a scrolling story, a book, a board or a deck.' },
]

function Studio() {
  return (
    <div className="grid gap-12 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-16">
      <figure data-reveal className={REVEAL}>
        <blockquote className="font-(family-name:--serif) text-[clamp(28px,3.4vw,44px)] font-medium leading-[1.14] tracking-[-.02em] text-balance">
          <span aria-hidden className="mr-1 text-(--pink)">“</span>
          The map does the argument. The prose does the meaning.
        </blockquote>
        <figcaption className="mt-6 max-w-[52ch] text-[16px] leading-[1.7] text-(--muted)">
          Vizmaya {STUDIO.motto.charAt(0).toLowerCase() + STUDIO.motto.slice(1)} We work with B2B data companies, research
          institutions and think tanks who have the findings but need the storytelling and design layer to make them travel.
        </figcaption>
        {/* An HTML story, served by a route handler rather than the app router: a full load. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/s/vizmaya-studio"
          className="mt-8 inline-flex items-center gap-2 font-(family-name:--mono) text-[11px] uppercase tracking-[.18em] text-(--ink) underline decoration-(--teal) decoration-2 underline-offset-[6px] hover:text-(--teal)"
        >
          The studio’s own story, as a board <ArrowUpRight size={14} weight="bold" aria-hidden />
        </a>
      </figure>
      <ol className="grid gap-px overflow-hidden rounded-[10px] border border-(--line2) bg-(--line2)">
        {PROCESS.map((p) => (
          <li key={p.n} data-reveal className={`grid grid-cols-[56px_1fr] gap-4 bg-(--paper) p-6 ${REVEAL}`}>
            <span className="font-(family-name:--serif) text-[30px] font-semibold leading-none text-(--teal)">{p.n}</span>
            <span>
              <span className="block font-(family-name:--serif) text-[21px] font-semibold leading-tight">{p.title}</span>
              <span className="mt-2 block text-[15px] leading-[1.6] text-(--muted)">{p.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ── the page ──────────────────────────────────────────────────────────────

export default function HomeStory({ data, today }: { data: HomeData; today: string }) {
  const root = useRef<HTMLDivElement>(null)
  useReveal(root)
  const { stories, epics, dailyEditions, dailyVars, fontUrls } = data

  return (
    <div
      ref={root}
      style={TOKENS}
      className="min-h-screen bg-(--cream) font-(family-name:--sans) text-(--ink) antialiased selection:bg-(--teal) selection:text-(--ink)"
    >
      {/* each epic card renders in its own typefaces */}
      <StoryGridFonts fontUrls={fontUrls} />
      <Masthead />

      <main>
        <Lede data={data} today={today} />

        <Chapter
          id="front-page"
          numeral="I"
          title="The front page"
          dek={
            <>
              Every story we have published, bound four ways. Turn it as a <b className="font-semibold text-(--ink)">book</b>, tour it
              as a <b className="font-semibold text-(--ink)">board</b>, step through it as a <b className="font-semibold text-(--ink)">deck</b>, or
              simply <b className="font-semibold text-(--ink)">scroll</b>.
            </>
          }
        >
          <FrontPage stories={stories} />
        </Chapter>

        {dailyEditions.length > 0 && (
          <Chapter
            id="daily"
            numeral="II"
            tone="blue"
            title="Doom v Boom, every morning"
            dek="Each morning we read the previous day of AI data-centre, energy and sustainability news and score it: a Boom Score out of 100, where 50 is balanced."
            aside={
              <Link
                href="/ai-daily/doom-v-boom"
                className="inline-flex items-center gap-2 font-(family-name:--mono) text-[11px] uppercase tracking-[.18em] text-(--ink) underline-offset-4 hover:underline"
              >
                <Newspaper size={16} aria-hidden /> Every edition
              </Link>
            }
          >
            <DailyEditions editions={dailyEditions} vars={dailyVars} />
          </Chapter>
        )}

        {epics.length > 0 && (
          <Chapter
            id="epics"
            numeral={dailyEditions.length > 0 ? 'III' : 'II'}
            tone="pink"
            title="Epics"
            dek="Investigations we keep returning to: each a collection of stories with a landing page of its own."
          >
            <Epics epics={epics} />
          </Chapter>
        )}

        <Chapter
          id="studio"
          numeral={['II', 'III', 'IV'][(dailyEditions.length > 0 ? 1 : 0) + (epics.length > 0 ? 1 : 0)]}
          title="The studio"
          dek="Two people who make data stories for others, and publish their own."
        >
          <Studio />
        </Chapter>

        {/* the call to action, set in ink */}
        <section id="contact" className="scroll-mt-16 border-t-[3px] border-(--teal) bg-(--ink) px-4 py-28 text-center text-(--cream) sm:px-8 md:py-36">
          <div data-reveal className={`mx-auto max-w-[760px] ${REVEAL}`}>
            <div className="flex justify-center">
              <Kicker>Work with us</Kicker>
            </div>
            <h2 className="mx-auto mt-6 max-w-[18ch] font-(family-name:--serif) text-[clamp(34px,5vw,60px)] font-medium leading-[1.06] tracking-[-.02em] text-balance">
              Have data that deserves a better story?
            </h2>
            <p className="mx-auto mt-6 max-w-[54ch] text-[15px] leading-[1.85] text-[rgba(244,241,236,.62)]">
              A typical engagement starts with a data brief and an editorial call. Turnaround is two to four weeks.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <a
                href={`mailto:${STUDIO.email}`}
                className="inline-flex items-center gap-2 rounded-[3px] bg-(--teal) px-7 py-4 font-(family-name:--mono) text-[11px] font-medium uppercase tracking-[.16em] text-(--ink) transition-opacity hover:opacity-90"
              >
                <EnvelopeSimple size={16} weight="bold" aria-hidden /> Get in touch
              </a>
              <a
                href={STUDIO.newsletter}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-[3px] border border-[rgba(244,241,236,.3)] px-7 py-4 font-(family-name:--mono) text-[11px] uppercase tracking-[.16em] text-(--cream) transition-colors hover:border-(--cream)"
              >
                Read The Asymmetry Letter <ArrowUpRight size={14} weight="bold" aria-hidden />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-5 border-t border-white/5 bg-(--ink) px-4 py-7 text-(--cream) sm:px-8">
        <div className="flex items-center gap-3">
          <PenroseMark size={20} line="rgba(255,255,255,.22)" />
          <span className="font-(family-name:--serif) text-[16px] text-[rgba(244,241,236,.7)]">{STUDIO.name}</span>
          <span className="hidden max-w-[40ch] font-(family-name:--mono) text-[9px] uppercase tracking-[.1em] text-[rgba(244,241,236,.3)] md:inline">
            {STUDIO.motto}
          </span>
        </div>
        <div className="flex items-center gap-5 text-[rgba(244,241,236,.5)]">
          <a href={STUDIO.youtube} target="_blank" rel="noreferrer" aria-label="YouTube" className="transition-colors hover:text-(--teal)">
            <YoutubeLogo size={20} aria-hidden />
          </a>
          <a href={STUDIO.linkedin} target="_blank" rel="noreferrer" aria-label="LinkedIn" className="transition-colors hover:text-(--teal)">
            <LinkedinLogo size={20} aria-hidden />
          </a>
          <a href={STUDIO.x} target="_blank" rel="noreferrer" aria-label="X" className="transition-colors hover:text-(--teal)">
            <XLogo size={20} aria-hidden />
          </a>
        </div>
      </footer>
    </div>
  )
}
