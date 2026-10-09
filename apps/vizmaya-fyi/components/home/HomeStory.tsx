'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import {
  ArrowCounterClockwise,
  ArrowRight,
  ArrowUpRight,
  EnvelopeSimple,
  LinkedinLogo,
  Newspaper,
  Warning,
  XLogo,
  YoutubeLogo,
} from '@phosphor-icons/react'
import { StoryGridFonts, epicCardTheme } from '@vismay/ui'
import VizmayaLogo from '@/components/VizmayaLogo'
import { LiveRing } from '@/app/ai-daily/doom-v-boom/components/ScoreRing'
import { trackTopicFiltered } from '@/lib/analytics'
import {
  CONTACT,
  FRONT_PAGE_LIMIT,
  HOME_PENDING_STYLE_ID,
  HOME_VIEWS,
  HOME_VIEW_META,
  MARK,
  PALETTE,
  PROCESS,
  STUDIO,
  homeStats,
  isHomeStageFormat,
  storiesForTopic,
  storyTopics,
  type HomeDailyEdition,
  type HomeData,
  type HomeEpic,
  type HomeStory as HomeStoryCard,
  type HomeView,
} from '@/lib/home/homeShape'
import { Chapter, CountUp, PenroseMark, REVEAL, useReveal } from './bits'
import HomeStage from './HomeStage'
import ScrollIndex from './ScrollIndex'
import ViewSwitcher, { VIEW_ICONS } from './ViewSwitcher'
import { chooseHomeView, useHomeView } from './homeViewStore'

/**
 * The vizmaya.fyi home page, told as an HTML story and bound four ways. The
 * whole page is a Book, a Board or a Deck (each a stage document on the
 * hosted story formats, framed full-screen under the masthead, which carries
 * the switcher) or a Scroll: the long page below, which is also the fallback.
 * It is what the server renders (every link is in the HTML without JS), what
 * shows when a stage doesn't come up, and what a reader gets by asking a
 * format to "Read as one page". Palette and type: lib/home/homeShape.
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

function Masthead({ view, staged }: { view: HomeView; staged: boolean }) {
  const bar = useRef<HTMLDivElement>(null)
  const nav = useRef<HTMLElement>(null)
  // On the scroll page: reading progress along the bottom of the bar, and a
  // solid bar once scrolled. Over a stage the bar is always solid.
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

  const anchors = [
    { href: '#stories', label: 'Stories' },
    { href: '#daily', label: 'Daily' },
    { href: '#epics', label: 'Epics' },
    { href: '#studio', label: 'Studio' },
  ]
  const linkClass = 'text-[14px] text-(--muted) transition-colors hover:text-(--text)'
  return (
    <nav
      ref={nav}
      aria-label="vizmaya"
      data-staged={staged || undefined}
      className="fixed inset-x-0 top-0 z-50 h-16 border-b border-transparent transition-[background-color,border-color] duration-300 data-[scrolled]:border-(--line) data-[scrolled]:bg-[rgba(14,15,18,.82)] data-[scrolled]:backdrop-blur-md data-[staged]:border-(--line) data-[staged]:bg-(--bg) hs-mast"
    >
      <div className="mx-auto flex h-full max-w-[1240px] items-center justify-between gap-3 px-3 sm:px-8">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Vizmaya Labs, back to the top"
          className="-ml-1 flex flex-none items-center"
        >
          <VizmayaLogo className="h-[34px] w-[120px] sm:h-[42px] sm:w-[170px]" palette={LOGO_PALETTE} />
        </button>
        <ViewSwitcher view={view} />
        <div className="hidden flex-none items-center gap-6 sm:flex">
          {!staged &&
            anchors.map((l) => (
              <a key={l.href} href={l.href} className={`hidden xl:inline ${linkClass}`}>
                {l.label}
              </a>
            ))}
          <Link href="/stories" className={`hidden lg:inline ${linkClass}`}>
            Archive
          </Link>
          <a
            href={STUDIO.youtube}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-(--text) px-4 py-2 text-[14px] font-medium text-(--bg) transition-colors hover:bg-(--signal)"
          >
            <YoutubeLogo size={16} weight="fill" aria-hidden /> <span className="hidden md:inline">Subscribe</span>
          </a>
        </div>
      </div>
      {!staged && (
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[2px]">
          <div ref={bar} className="h-full origin-left scale-x-0 bg-(--signal)" />
        </div>
      )}
    </nav>
  )
}

// ── the lede ──────────────────────────────────────────────────────────────

function Lede({ data, today }: { data: HomeData; today: string }) {
  const stats = homeStats(data)
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

        {/* rebind the whole page */}
        <div data-reveal className={`mt-16 ${REVEAL}`}>
          <p className="font-(family-name:--serif) text-[30px] leading-none">
            Read this page as a book, a board or a <em className="text-(--signal)">deck</em>
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {HOME_VIEWS.map((v) => {
              const I = VIEW_ICONS[v]
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    chooseHomeView(v)
                    window.scrollTo({ top: 0 })
                  }}
                  className="group flex flex-col gap-3 rounded-[14px] border border-(--line) bg-(--surface) p-4 text-left transition-[border-color,transform,background-color] duration-300 hover:-translate-y-0.5 hover:border-(--signal) hover:bg-(--surface2)"
                >
                  <I size={26} aria-hidden className="text-(--signal)" />
                  <span className="font-(family-name:--serif) text-[30px] leading-none">{HOME_VIEW_META[v].label}</span>
                  <span className="text-[13px] leading-[1.45] text-(--muted)">{HOME_VIEW_META[v].hint}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </header>
  )
}

// ── stories ───────────────────────────────────────────────────────────────

function Stories({ stories }: { stories: HomeStoryCard[] }) {
  const [topic, setTopic] = useState<string | null>(null)
  const topics = useMemo(() => storyTopics(stories), [stories])
  const shown = useMemo(() => storiesForTopic(stories, topic).slice(0, FRONT_PAGE_LIMIT), [stories, topic])
  const pick = useCallback((t: string | null) => {
    setTopic(t)
    trackTopicFiltered(t ?? 'All')
  }, [])
  return (
    <>
      {topics.length > 0 && (
        <div role="group" aria-label="Filter by topic" className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          {[null, ...topics].map((t) => {
            const on = t === topic
            return (
              <button
                key={t ?? 'all'}
                type="button"
                aria-pressed={on}
                onClick={() => pick(t)}
                className={`h-8 flex-none rounded-full border px-3.5 text-[13px] transition-colors ${
                  on ? 'border-(--signal) bg-(--signal) text-(--bg)' : 'border-(--line2) text-(--muted) hover:border-(--text) hover:text-(--text)'
                }`}
              >
                {t ?? 'All'}
              </button>
            )
          })}
        </div>
      )}
      <ScrollIndex stories={shown} total={stories.length} />
    </>
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

function Studio() {
  return (
    <div className="grid gap-12 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-16">
      <figure data-reveal className={REVEAL}>
        <blockquote className="font-(family-name:--serif) text-[clamp(34px,4.2vw,58px)] leading-[1.02] tracking-[-.015em] text-balance">
          The map does the argument. The prose does <em className="text-(--signal)">the meaning.</em>
        </blockquote>
        <figcaption className="mt-6 max-w-[52ch] text-[16px] leading-[1.7] text-(--muted)">
          Vizmaya {STUDIO.motto.charAt(0).toLowerCase() + STUDIO.motto.slice(1)} Two people who make data stories for others, and
          publish their own.
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

  // Which binding is on. A stage that fails (or never reports ready) leaves
  // the page on Scroll with a notice; "Try again" mounts a fresh stage.
  const view = useHomeView()
  const format = isHomeStageFormat(view) ? view : null
  const [attempt, setAttempt] = useState(0)
  const [readyKey, setReadyKey] = useState<string | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const key = format ? `${format}|${attempt}` : null
  const failed = key !== null && failedKey === key
  const staged = format !== null && !failed
  const onReady = useCallback(() => setReadyKey(key), [key])
  const onFail = useCallback(() => setFailedKey(key), [key])
  const onLinear = useCallback(() => chooseHomeView('scroll'), [])

  // The pre-paint script (app/page.tsx) hid the scroll page for the binding
  // it expected; let go once that binding is the one rendered.
  useEffect(() => {
    const pending = document.getElementById(HOME_PENDING_STYLE_ID)
    if (pending && pending.getAttribute('data-view') === view) pending.remove()
  }, [view])

  // A stage owns the screen: start it, and the scroll page after it, at the top.
  useEffect(() => {
    if (staged) window.scrollTo({ top: 0 })
  }, [staged])

  return (
    <div
      ref={root}
      style={TOKENS}
      className={`${fontVars} min-h-screen bg-(--bg) font-(family-name:--sans) text-(--text) antialiased selection:bg-(--signal) selection:text-(--bg)`}
    >
      {/* each epic card renders in its own typefaces */}
      <StoryGridFonts fontUrls={fontUrls} />
      <Masthead view={view} staged={staged} />

      {staged && format && (
        <HomeStage key={key} format={format} ready={readyKey === key} onReady={onReady} onLinear={onLinear} onFail={onFail} />
      )}

      {/* the scroll page: the Scroll binding, and the fallback for the others */}
      <div hidden={staged} className="hs-scroll">
        {failed && format && (
          <div role="status" className="fixed inset-x-0 top-16 z-40 border-b border-(--line2) bg-(--surface) px-4 py-3 text-[14px] text-(--muted) sm:px-8">
            <div className="mx-auto flex max-w-[1180px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-2">
                <Warning size={18} className="flex-none text-(--signal)" aria-hidden />
                The {HOME_VIEW_META[format].label.toLowerCase()} didn’t open, so here is the page as one long scroll.
              </span>
              <button
                type="button"
                onClick={() => setAttempt((a) => a + 1)}
                className="inline-flex flex-none items-center gap-2 font-medium text-(--text) hover:text-(--signal)"
              >
                <ArrowCounterClockwise size={15} weight="bold" aria-hidden /> Try again
              </button>
            </div>
          </div>
        )}

        <main>
          <Lede data={data} today={today} />

          <Chapter
            id="stories"
            title={
              <>
                The <em>stories</em>
              </>
            }
            dek="The newest first. Every one of them is also in the book, on the board and in the deck."
            aside={
              <Link
                href="/stories"
                className="inline-flex items-center gap-2 text-[15px] font-medium text-(--text) underline decoration-(--signal) underline-offset-[6px] hover:text-(--signal)"
              >
                All {stories.length} stories <ArrowUpRight size={15} weight="bold" aria-hidden />
              </Link>
            }
          >
            <Stories stories={stories} />
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
              <p className="mx-auto mt-7 max-w-[60ch] text-[16px] leading-[1.8] text-(--muted)">{CONTACT.body}</p>
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
    </div>
  )
}
