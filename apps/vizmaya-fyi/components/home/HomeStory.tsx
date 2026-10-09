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
  HOME_VIEWS,
  HOME_VIEW_META,
  MARK,
  PALETTE,
  STUDIO,
  type HomeDailyEdition,
  type HomeData,
  type HomeEpic,
} from '@/lib/home/homeShape'
import { Chapter, CountUp, PenroseMark, REVEAL, useReveal } from './bits'
import FrontPage, { VIEW_ICONS } from './FrontPage'
import { chooseHomeView } from './homeViewStore'

/**
 * The vizmaya.fyi home page, told as an HTML story: a masthead and a lede,
 * then chapters. The first is the front page itself, swappable between a
 * Book, a Board and a Deck (the hosted story formats) with a plain Scroll as
 * the fallback; then the Doom v Boom daily, the epics, the studio and how to
 * work with it. Palette and type come from lib/home/homeShape (PALETTE, TYPE).
 */

const TOKENS = {
  '--bg': PALETTE.bg,
  '--surface': PALETTE.surface,
  '--surface2': PALETTE.surface2,
  '--text': PALETTE.text,
  '--muted': PALETTE.muted,
  '--dim': PALETTE.dim,
  '--line': PALETTE.line,
  '--line2': PALETTE.line2,
  '--signal': PALETTE.signal,
  '--sky': PALETTE.sky,
  '--mint': PALETTE.mint,
  '--serif': 'var(--font-home-serif), Georgia, serif',
  '--sans': 'var(--font-home-sans), -apple-system, "Segoe UI", sans-serif',
  '--mono': 'var(--font-home-mono), ui-monospace, monospace',
} as CSSProperties

const LOGO_PALETTE = {
  text: PALETTE.text,
  teal: MARK.teal,
  accent: MARK.pink,
  accent2: MARK.blue,
  surface: PALETTE.bg,
  muted: PALETTE.text,
  line: PALETTE.text,
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
  const linkClass = 'text-[14px] text-(--muted) transition-colors hover:text-(--text)'
  return (
    <nav
      ref={nav}
      aria-label="vizmaya"
      className="fixed inset-x-0 top-0 z-50 border-b border-transparent transition-[background-color,border-color] duration-300 data-[scrolled]:border-(--line) data-[scrolled]:bg-[rgba(14,15,18,.82)] data-[scrolled]:backdrop-blur-md"
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
            <a key={l.href} href={l.href} className={`hidden md:inline ${linkClass}`}>
              {l.label}
            </a>
          ))}
          <Link href="/stories" className={`hidden sm:inline ${linkClass}`}>
            Archive
          </Link>
          <a
            href={STUDIO.youtube}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-(--text) px-4 py-2 text-[14px] font-medium text-(--bg) transition-colors hover:bg-(--signal)"
          >
            <YoutubeLogo size={16} weight="fill" aria-hidden /> Subscribe
          </a>
        </div>
      </div>
      <div aria-hidden className="h-[2px] w-full">
        <div ref={bar} className="h-full origin-left scale-x-0 bg-(--signal)" />
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
    <header className="relative overflow-hidden px-4 pb-16 pt-36 sm:px-8 md:pb-24 md:pt-48">
      {/* a low signal glow behind the lede */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[20%] -top-[30%] h-[900px] w-[900px] rounded-full bg-[radial-gradient(circle,rgba(255,106,61,.16),transparent_62%)]"
      />
      <div className="relative mx-auto max-w-[1180px]">
        <h1
          data-reveal
          className={`max-w-[13ch] font-(family-name:--serif) text-[clamp(56px,10vw,152px)] font-normal leading-[.9] tracking-[-.03em] text-balance ${REVEAL}`}
        >
          We turn complex data into stories <em className="text-(--signal)">impossible to ignore.</em>
        </h1>
        <div data-reveal className={`mt-12 grid gap-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-16 ${REVEAL}`}>
          <div>
            <p className="max-w-[58ch] text-[clamp(18px,1.55vw,21px)] leading-[1.65] text-(--muted) first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:font-(family-name:--serif) first-letter:text-[78px] first-letter:leading-[.72] first-letter:text-(--text)">
              {STUDIO.deck}
            </p>
            <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-(--dim)">
              <PenroseMark size={18} />
              <span>By the Vizmaya studio</span>
              <span aria-hidden>·</span>
              <span>Updated {today}</span>
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-7 self-start border-t border-(--line2) pt-6">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <CountUp value={s.n} className="block font-(family-name:--serif) text-[64px] leading-[.85] tracking-[-.02em]" />
                  <span className="mt-2 block text-[14px] text-(--muted)">{s.label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* choose a binding, then jump to it */}
        <div data-reveal className={`mt-16 ${REVEAL}`}>
          <p className="font-(family-name:--serif) text-[30px] leading-none">
            How would you like to <em className="text-(--signal)">read it?</em>
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {HOME_VIEWS.map((v) => {
              const I = VIEW_ICONS[v]
              return (
                <a
                  key={v}
                  href="#front-page"
                  onClick={() => chooseHomeView(v)}
                  className="group flex flex-col gap-3 rounded-[14px] border border-(--line) bg-(--surface) p-4 transition-[border-color,transform,background-color] duration-300 hover:-translate-y-0.5 hover:border-(--signal) hover:bg-(--surface2)"
                >
                  <span className="flex items-center justify-between">
                    <I size={26} aria-hidden className="text-(--signal)" />
                    <ArrowDown size={14} aria-hidden className="text-(--dim) transition-transform group-hover:translate-y-0.5" />
                  </span>
                  <span className="font-(family-name:--serif) text-[30px] leading-none">{HOME_VIEW_META[v].label}</span>
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

// ── doom v boom ───────────────────────────────────────────────────────────

function DailyEditions({ editions, vars }: { editions: HomeDailyEdition[]; vars: Record<string, string> }) {
  // The edition tokens under their own names for the ring (--boom, --doom,
  // --dim …) and --dv-* aliases for these cards, since the page already owns
  // --muted / --line / --dim.
  const style: Record<string, string> = {}
  for (const [k, v] of Object.entries(vars)) style[`--dv-${k.slice(2)}`] = v
  for (const k of ['--boom', '--doom', '--dim']) if (vars[k]) style[k] = vars[k]
  return (
    <div data-ring-palette="" style={style as CSSProperties} className="grid gap-4 md:grid-cols-3">
      {editions.map((e) => (
        <Link
          key={e.href}
          href={e.href}
          data-reveal
          data-tone={e.tone}
          className={`group flex min-h-[300px] flex-col gap-5 rounded-[14px] border border-(--dv-line) bg-(--dv-surface) p-6 text-(--dv-bone) transition-[border-color,transform] hover:-translate-y-0.5 hover:border-(--dv-accent) ${REVEAL}`}
        >
          <span className="flex items-center gap-4">
            <LiveRing score={e.moodScore} className="w-[108px] flex-none">
              <span className="font-(family-name:--serif) text-[34cqi] leading-none tracking-[-.02em] tabular-nums text-(--dv-bone)">
                {e.score ?? '—'}
              </span>
            </LiveRing>
            <span className="grid gap-1.5">
              <span className="font-(family-name:--serif) text-[26px] leading-[1.05] text-(--dv-muted) group-data-[tone=boom]:text-(--dv-boom-ink) group-data-[tone=doom]:text-(--dv-doom-ink)">
                {e.word}
              </span>
              <span className="font-(family-name:--mono) text-[11px] text-(--dv-dim)">
                {e.signed}
                {e.score != null ? ' · Boom Score / 100' : ''}
              </span>
            </span>
          </span>
          <span className="font-(family-name:--serif) text-[24px] leading-[1.12] text-pretty">{e.headline}</span>
          <span className="mt-auto flex items-center justify-between gap-3 text-[13px]">
            <span className="font-(family-name:--mono) text-[11px] uppercase tracking-[.06em] text-(--dv-muted)">
              {e.date}
              {e.number != null ? ` · No. ${e.number}` : ''}
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-(--dv-accent)">
              Read <ArrowRight size={13} weight="bold" aria-hidden />
            </span>
          </span>
        </Link>
      ))}
    </div>
  )
}

// ── epics ─────────────────────────────────────────────────────────────────

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
            className={`group relative flex min-h-[260px] flex-col overflow-hidden rounded-[14px] border border-(--line) p-6 transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-(--ea) ${REVEAL}`}
          >
            <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-(--ea)" />
            <span
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-(--ea) opacity-20 blur-3xl transition-opacity group-hover:opacity-35"
            />
            <span className="text-[34px] leading-[1] tracking-[-.01em]" style={{ fontFamily: t.serif ?? 'var(--serif)' }}>
              {e.name}
            </span>
            {e.description && <span className="mt-3 line-clamp-3 text-[15px] leading-[1.55] text-(--em)">{e.description}</span>}
            <span className="mt-auto inline-flex items-center gap-2 pt-6 text-[14px] font-medium text-(--ea)">
              Enter the collection <ArrowRight size={14} weight="bold" aria-hidden className="transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        )
      })}
    </div>
  )
}

// ── the studio ────────────────────────────────────────────────────────────

const PROCESS = [
  { n: '01', title: 'A data brief', body: 'You bring findings worth publishing. We read the data the way a sceptical reader would.' },
  { n: '02', title: 'An editorial call', body: 'We agree the argument, the evidence and the one chart that carries it.' },
  { n: '03', title: 'Two to four weeks', body: 'Maps, charts and prose, built to travel: a scrolling story, a book, a board or a deck.' },
]

function Studio() {
  return (
    <div className="grid gap-12 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-16">
      <figure data-reveal className={REVEAL}>
        <blockquote className="font-(family-name:--serif) text-[clamp(34px,4.2vw,58px)] leading-[1.02] tracking-[-.015em] text-balance">
          The map does the argument. The prose does <em className="text-(--signal)">the meaning.</em>
        </blockquote>
        <figcaption className="mt-6 max-w-[52ch] text-[16px] leading-[1.7] text-(--muted)">
          Vizmaya {STUDIO.motto.charAt(0).toLowerCase() + STUDIO.motto.slice(1)} We work with B2B data companies, research
          institutions and think tanks who have the findings but need the storytelling and design layer to make them travel.
        </figcaption>
        {/* An HTML story, served by a route handler rather than the app router: a full load. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/s/vizmaya-studio"
          className="mt-8 inline-flex items-center gap-2 text-[15px] font-medium text-(--text) underline decoration-(--signal) underline-offset-[6px] hover:text-(--signal)"
        >
          The studio’s own story, as a board <ArrowUpRight size={15} weight="bold" aria-hidden />
        </a>
      </figure>
      <ol className="grid gap-px overflow-hidden rounded-[14px] border border-(--line) bg-(--line)">
        {PROCESS.map((p) => (
          <li key={p.n} data-reveal className={`grid grid-cols-[60px_1fr] gap-4 bg-(--surface) p-6 ${REVEAL}`}>
            <span className="font-(family-name:--serif) text-[44px] italic leading-[.8] text-(--signal)">{p.n}</span>
            <span>
              <span className="block font-(family-name:--serif) text-[28px] leading-none">{p.title}</span>
              <span className="mt-2 block text-[15px] leading-[1.6] text-(--muted)">{p.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ── the page ──────────────────────────────────────────────────────────────

export default function HomeStory({ data, today, fontVars = '' }: { data: HomeData; today: string; fontVars?: string }) {
  const root = useRef<HTMLDivElement>(null)
  useReveal(root)
  const { stories, epics, dailyEditions, dailyVars, fontUrls } = data

  return (
    <div
      ref={root}
      style={TOKENS}
      className={`${fontVars} min-h-screen bg-(--bg) font-(family-name:--sans) text-(--text) antialiased selection:bg-(--signal) selection:text-(--bg)`}
    >
      {/* each epic card renders in its own typefaces */}
      <StoryGridFonts fontUrls={fontUrls} />
      <Masthead />

      <main>
        <Lede data={data} today={today} />

        <Chapter
          id="front-page"
          title={
            <>
              The front page, <em>bound four ways</em>
            </>
          }
          dek="Every story we have published. Turn it as a book, tour it as a board, step through it as a deck, or simply scroll."
        >
          <FrontPage stories={stories} />
        </Chapter>

        {dailyEditions.length > 0 && (
          <Chapter
            id="daily"
            title={
              <>
                Doom v Boom, <em>every morning</em>
              </>
            }
            dek="Each morning we read the previous day of AI data-centre, energy and sustainability news and score it: a Boom Score out of 100, where 50 is balanced."
            aside={
              <Link
                href="/ai-daily/doom-v-boom"
                className="inline-flex items-center gap-2 text-[15px] font-medium text-(--text) underline decoration-(--signal) underline-offset-[6px] hover:text-(--signal)"
              >
                <Newspaper size={17} aria-hidden /> Every edition
              </Link>
            }
          >
            <DailyEditions editions={dailyEditions} vars={dailyVars} />
          </Chapter>
        )}

        {epics.length > 0 && (
          <Chapter
            id="epics"
            title={
              <>
                The <em>epics</em>
              </>
            }
            dek="Investigations we keep returning to: each a collection of stories with a landing page of its own."
          >
            <Epics epics={epics} />
          </Chapter>
        )}

        <Chapter
          id="studio"
          title={
            <>
              The <em>studio</em>
            </>
          }
          dek="Two people who make data stories for others, and publish their own."
        >
          <Studio />
        </Chapter>

        {/* the call to action */}
        <section id="contact" className="relative scroll-mt-16 overflow-hidden border-t border-(--line) bg-(--surface) px-4 py-28 text-center sm:px-8 md:py-40">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-full h-[700px] w-[1100px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,106,61,.18),transparent_62%)]"
          />
          <div data-reveal className={`relative mx-auto max-w-[820px] ${REVEAL}`}>
            <h2 className="mx-auto max-w-[16ch] font-(family-name:--serif) text-[clamp(44px,6.4vw,88px)] leading-[.95] tracking-[-.02em] text-balance">
              Have data that deserves a <em className="text-(--signal)">better story?</em>
            </h2>
            <p className="mx-auto mt-7 max-w-[54ch] text-[16px] leading-[1.8] text-(--muted)">
              A typical engagement starts with a data brief and an editorial call. Turnaround is two to four weeks.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <a
                href={`mailto:${STUDIO.email}`}
                className="inline-flex items-center gap-2 rounded-full bg-(--signal) px-7 py-4 text-[15px] font-medium text-(--bg) transition-colors hover:bg-(--text)"
              >
                <EnvelopeSimple size={17} weight="bold" aria-hidden /> Get in touch
              </a>
              <a
                href={STUDIO.newsletter}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-(--line2) px-7 py-4 text-[15px] text-(--text) transition-colors hover:border-(--text)"
              >
                Read The Asymmetry Letter <ArrowUpRight size={15} weight="bold" aria-hidden />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-5 border-t border-(--line) bg-(--bg) px-4 py-7 sm:px-8">
        <div className="flex items-center gap-3">
          <PenroseMark size={20} />
          <span className="font-(family-name:--serif) text-[20px] leading-none">{STUDIO.name}</span>
          <span className="hidden max-w-[44ch] text-[13px] text-(--dim) md:inline">{STUDIO.motto}</span>
        </div>
        <div className="flex items-center gap-5 text-(--muted)">
          <a href={STUDIO.youtube} target="_blank" rel="noreferrer" aria-label="YouTube" className="transition-colors hover:text-(--signal)">
            <YoutubeLogo size={20} aria-hidden />
          </a>
          <a href={STUDIO.linkedin} target="_blank" rel="noreferrer" aria-label="LinkedIn" className="transition-colors hover:text-(--signal)">
            <LinkedinLogo size={20} aria-hidden />
          </a>
          <a href={STUDIO.x} target="_blank" rel="noreferrer" aria-label="X" className="transition-colors hover:text-(--signal)">
            <XLogo size={20} aria-hidden />
          </a>
        </div>
      </footer>
    </div>
  )
}
