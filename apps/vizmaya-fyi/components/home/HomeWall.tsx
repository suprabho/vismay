'use client'

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight } from '@phosphor-icons/react'
import { StoryGridFonts, epicCardTheme } from '@vismay/ui'
import VizmayaLogo from '@/components/VizmayaLogo'
import { LiveRing, StaticRing } from '@/app/ai-daily/doom-v-boom/components/ScoreRing'
import {
  FRONT_PAGE_LIMIT,
  HOME_SCHEME,
  MARK,
  SCHEME_ACCENTS,
  epicHref,
  epicPreviewUrl,
  type HomeDailyEdition,
  type HomeData,
  type HomeEpic,
} from '@/lib/home/homeShape'
import { schemeVars } from '@/lib/home/logoPalette'
import { HOME_SECTIONS } from '@/lib/home/sections'
import CategorySections from './CategorySections'
import { PenroseMark, REVEAL, useReveal } from './bits'
import LivePreview from './LivePreview'
import StoryTile, { COVER_LINK } from './StoryTile'

/**
 * The vizmaya.fyi home page: a wall of what we publish and nothing else. The
 * newest stories as tiles, each showing the story itself, live (LivePreview),
 * over a caption in the story's own colours; today's Doom v Boom score beside
 * the lead; a section per story category, each laid out its own way
 * (CategorySections); and the epics as bands, each previewing its landing
 * page. Every link is in the server-rendered HTML; the previews arrive with JS.
 */

const TOKENS = {
  ...schemeVars(HOME_SCHEME),
  '--serif': 'var(--font-home-serif), Georgia, serif',
  '--sans': 'var(--font-home-sans), -apple-system, "Segoe UI", sans-serif',
  '--mono': 'var(--font-home-mono), ui-monospace, monospace',
} as CSSProperties

const LOGO_PALETTE = {
  text: HOME_SCHEME.text,
  teal: MARK.teal,
  accent: MARK.pink,
  accent2: MARK.blue,
  surface: HOME_SCHEME.bg,
  muted: HOME_SCHEME.text,
  line: HOME_SCHEME.text,
}

// ── the bar ───────────────────────────────────────────────────────────────

function Bar({ daily, sections, epics }: { daily: boolean; sections: boolean; epics: boolean }) {
  const nav = useRef<HTMLElement>(null)
  useEffect(() => {
    const update = () => nav.current?.toggleAttribute('data-scrolled', window.scrollY > 8)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])
  const links = [
    { href: '#stories', label: 'Stories', on: true },
    { href: '#daily', label: 'Doom v Boom', on: daily },
    { href: '#sections', label: 'Subjects', on: sections },
    { href: '#epics', label: 'Epics', on: epics },
  ].filter((l) => l.on)
  return (
    <nav
      ref={nav}
      aria-label="vizmaya"
      className="fixed inset-x-0 top-0 z-50 h-14 border-b border-transparent transition-[background-color,border-color] duration-300 data-[scrolled]:border-(--line) data-[scrolled]:bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] data-[scrolled]:backdrop-blur-md"
    >
      <div className="flex h-full items-center justify-between gap-3 px-3 sm:px-4">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="vizmaya, back to the top"
          className="-ml-1 flex flex-none items-center"
        >
          <VizmayaLogo className="h-[32px] w-[112px] sm:h-[38px] sm:w-[150px]" palette={LOGO_PALETTE} />
        </button>
        <div className="flex items-center gap-4 text-[13px] text-(--muted) sm:gap-7 sm:text-[14px]">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="whitespace-nowrap transition-colors hover:text-(--text)">
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  )
}

// ── stories ───────────────────────────────────────────────────────────────

/** Where each story sits on the wall: the lead large, then a tall, a wide and plain tiles. */
const SPANS = [
  'h-[480px] sm:col-span-6 sm:row-span-2 lg:col-span-8',
  'sm:col-span-3 lg:col-span-4',
  'sm:col-span-3 lg:col-span-4',
  'sm:col-span-6 lg:col-span-4',
  'sm:col-span-3 sm:row-span-2 lg:col-span-4',
  'sm:col-span-3 lg:col-span-8',
  'sm:col-span-3 lg:col-span-4',
  'sm:col-span-6 lg:col-span-4',
  'sm:col-span-3 lg:col-span-6',
  'sm:col-span-3 lg:col-span-6',
  'sm:col-span-3 lg:col-span-4',
  'sm:col-span-3 lg:col-span-4',
]

/** The last tile of the wall: the way to every other story. */
function ArchiveTile({ total }: { total: number }) {
  return (
    <Link
      href="/stories"
      data-reveal
      className={`group flex min-h-[180px] flex-col justify-between rounded-[14px] border border-(--line2) p-6 transition-colors hover:border-(--signal) hover:bg-(--surface) sm:col-span-6 lg:col-span-4 ${REVEAL}`}
    >
      <span className="font-(family-name:--serif) text-[clamp(34px,3.4vw,48px)] leading-[.98] tracking-[-.01em]">
        All {total} <em className="text-(--signal)">stories</em>
      </span>
      <span className="inline-flex items-center gap-2 text-[14px] font-medium text-(--muted) transition-colors group-hover:text-(--text)">
        Open the archive <ArrowRight size={14} weight="bold" aria-hidden className="transition-transform group-hover:translate-x-1" />
      </span>
    </Link>
  )
}

// ── doom v boom ───────────────────────────────────────────────────────────

function DailyTile({ editions, vars }: { editions: HomeDailyEdition[]; vars: Record<string, string> }) {
  // The edition tokens under their own names for the rings (--boom, --doom,
  // --dim) and --dv-* aliases for the tile, since the page owns --muted / --line.
  const style: Record<string, string> = {}
  for (const [k, v] of Object.entries(vars)) style[`--dv-${k.slice(2)}`] = v
  for (const k of ['--boom', '--doom', '--dim']) if (vars[k]) style[k] = vars[k]
  const [today, ...earlier] = editions
  const toneInk = 'data-[tone=boom]:text-(--dv-boom-ink) data-[tone=doom]:text-(--dv-doom-ink)'
  return (
    <section
      id="daily"
      aria-labelledby="daily-h"
      data-reveal
      data-ring-palette=""
      style={style as CSSProperties}
      className={`group relative flex scroll-mt-16 flex-col gap-6 overflow-hidden rounded-[14px] border border-(--dv-line) bg-(--dv-surface) p-5 text-(--dv-bone) transition-colors hover:border-(--dv-accent) sm:col-span-6 sm:max-lg:flex-row sm:max-lg:items-center sm:max-lg:gap-8 lg:col-span-4 lg:row-span-2 lg:p-6 ${REVEAL}`}
    >
      <div className="grid gap-5 sm:max-lg:w-[36%] sm:max-lg:flex-none">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="daily-h" className="font-(family-name:--serif) text-[28px] font-normal leading-none">
            Doom <em className="text-(--dv-muted)">v</em> Boom
          </h2>
          <span className="font-(family-name:--mono) text-[11px] uppercase tracking-[.06em] text-(--dv-muted)">
            {today.date}
            {today.number != null ? ` · No. ${today.number}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-5">
          <LiveRing score={today.moodScore} className="w-[clamp(112px,38%,176px)] flex-none">
            <span className="font-(family-name:--serif) text-[34cqi] leading-none tracking-[-.02em] tabular-nums">{today.score ?? '—'}</span>
          </LiveRing>
          <p className="grid gap-1.5">
            <span data-tone={today.tone} className={`font-(family-name:--serif) text-[30px] leading-[1.02] text-(--dv-muted) ${toneInk}`}>
              {today.word}
            </span>
            <span className="font-(family-name:--mono) text-[11px] text-(--dv-dim)">
              {today.signed}
              {today.score != null ? ' · Boom Score / 100' : ''}
            </span>
          </p>
        </div>
      </div>

      <p className="font-(family-name:--serif) text-[clamp(22px,1.9vw,28px)] leading-[1.12] text-pretty sm:max-lg:min-w-0 sm:max-lg:flex-1">
        <Link href={today.href} className={`line-clamp-4 ${COVER_LINK}`}>
          {today.headline}
        </Link>
      </p>

      <div className="mt-auto grid grid-cols-[minmax(0,1fr)] gap-3 sm:max-lg:mt-0 sm:max-lg:min-w-0 sm:max-lg:flex-1">
        {earlier.length > 0 && (
          <ul className="grid grid-cols-[minmax(0,1fr)] border-t border-(--dv-line)">
            {earlier.map((e) => (
              <li key={e.href} className="border-b border-(--dv-line)">
                <Link href={e.href} className="relative z-20 flex items-center gap-3 py-2.5 transition-colors hover:text-(--dv-accent)">
                  <StaticRing score={e.moodScore} count={48} className="w-9 flex-none">
                    <span className="font-(family-name:--mono) text-[30cqi] tabular-nums">{e.score ?? '—'}</span>
                  </StaticRing>
                  <span className="min-w-0">
                    <span className="block font-(family-name:--mono) text-[10px] uppercase tracking-[.06em] text-(--dv-muted)">{e.date}</span>
                    <span className="block truncate text-[14px] leading-[1.35]">{e.headline}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/ai-daily/doom-v-boom"
          className="relative z-20 inline-flex items-center gap-2 self-start text-[14px] font-medium text-(--dv-accent) hover:underline hover:underline-offset-4"
        >
          Every edition <ArrowRight size={14} weight="bold" aria-hidden />
        </Link>
      </div>
    </section>
  )
}

// ── epics ─────────────────────────────────────────────────────────────────

function EpicBand({ epic, index }: { epic: HomeEpic; index: number }) {
  const t = epicCardTheme(epic.theme, index)
  // What the epic's theme doesn't set comes from the page's scheme.
  const own = (epic.theme ?? {}) as Record<string, unknown>
  const style = {
    '--eb': own.ink || own.surface ? t.bg : 'var(--surface2)',
    '--et': own.bone ? t.text : 'var(--text)',
    '--em': own.muted ? t.muted : 'var(--muted)',
    '--ea': own.accent || own.ember ? t.accent : SCHEME_ACCENTS[index % SCHEME_ACCENTS.length],
  } as CSSProperties
  const flip = index % 2 === 1
  return (
    <article
      data-reveal
      style={style}
      className={`group relative grid overflow-hidden rounded-[14px] bg-(--eb) text-(--et) md:h-[clamp(300px,33vw,460px)] md:grid-cols-12 ${REVEAL}`}
    >
      <div className={`flex flex-col p-6 md:col-span-5 md:p-9 ${flip ? 'md:order-2' : ''}`}>
        <h3
          className="text-[clamp(36px,4.4vw,64px)] font-normal leading-[.98] tracking-[-.015em] text-balance"
          style={{ fontFamily: t.serif ?? 'var(--serif)' }}
        >
          <Link href={epicHref(epic)} className={COVER_LINK}>
            {epic.name}
          </Link>
        </h3>
        {epic.description && <p className="mt-4 line-clamp-4 max-w-[46ch] text-[15px] leading-[1.6] text-(--em)">{epic.description}</p>}
        <span className="mt-auto inline-flex items-center gap-2 pt-6 text-[14px] font-medium text-(--ea)">
          Enter the collection <ArrowRight size={14} weight="bold" aria-hidden className="transition-transform group-hover:translate-x-1" />
        </span>
      </div>
      <div className="relative m-3 mt-0 h-[240px] overflow-hidden rounded-[10px] bg-[color-mix(in_srgb,var(--et)_6%,var(--eb))] md:col-span-7 md:m-3 md:h-auto">
        <span
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,color-mix(in_srgb,var(--ea)_30%,transparent),transparent_62%)]"
        />
        <LivePreview src={epicPreviewUrl(epic)} title={epic.name} />
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[14px] border border-[color-mix(in_srgb,var(--et)_10%,transparent)] transition-colors duration-300 group-hover:border-(--ea)"
      />
    </article>
  )
}

// ── the page ──────────────────────────────────────────────────────────────

export default function HomeWall({ data, fontVars = '' }: { data: HomeData; fontVars?: string }) {
  const root = useRef<HTMLDivElement>(null)
  useReveal(root)
  const { stories, epics, dailyEditions, dailyVars, fontUrls } = data
  const sections = data.sections.flatMap((x) => {
    const def = HOME_SECTIONS.find((d) => d.category === x.category)
    return def ? [{ def, stories: x.stories, total: x.total }] : []
  })
  const shown = stories.slice(0, FRONT_PAGE_LIMIT)
  const daily = dailyEditions.length > 0

  return (
    <div
      ref={root}
      style={TOKENS}
      className={`${fontVars} min-h-screen bg-(--bg) font-(family-name:--sans) text-(--text) antialiased selection:bg-(--signal) selection:text-(--on-signal)`}
    >
      {/* each epic band renders in its own typefaces */}
      <StoryGridFonts fontUrls={fontUrls} />
      <Bar daily={daily} sections={sections.length > 0} epics={epics.length > 0} />

      <main className="px-3 pb-16 pt-16 sm:px-4">
        <h1 className="sr-only">vizmaya: visual stories, Doom v Boom, stories by subject and the epics</h1>

        <section id="stories" aria-labelledby="stories-h" className="scroll-mt-16">
          <h2 id="stories-h" className="sr-only">
            Stories
          </h2>
          <div className="grid grid-flow-dense grid-cols-1 gap-3 sm:auto-rows-[clamp(260px,38vw,380px)] sm:grid-cols-6 lg:auto-rows-[clamp(264px,25vw,380px)] lg:grid-cols-12">
            {shown.map((s, i) => (
              <FragmentWithDaily key={s.slug} after={i === 0 && daily ? <DailyTile editions={dailyEditions} vars={dailyVars} /> : null}>
                <StoryTile story={s} index={i} lead={i === 0} showCategory className={i === 0 && !daily ? `${SPANS[0]} lg:col-span-12` : SPANS[i % SPANS.length]} />
              </FragmentWithDaily>
            ))}
            {shown.length === 0 && daily && <DailyTile editions={dailyEditions} vars={dailyVars} />}
            <ArchiveTile total={stories.length} />
          </div>
        </section>

        <CategorySections sections={sections} />

        {epics.length > 0 && (
          <section id="epics" aria-labelledby="epics-h" className="mt-20 scroll-mt-20 md:mt-28">
            <h2
              id="epics-h"
              data-reveal
              className={`mb-6 px-1 font-(family-name:--serif) text-[clamp(44px,6.4vw,84px)] font-normal leading-[.95] tracking-[-.02em] ${REVEAL}`}
            >
              The <em className="text-(--signal)">epics</em>
            </h2>
            <div className="grid gap-3">
              {epics.map((e, i) => (
                <EpicBand key={e.slug} epic={e} index={i} />
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="flex items-center justify-between gap-5 border-t border-(--line) px-4 py-6 text-[13px] text-(--dim)">
        <span className="flex items-center gap-3">
          <PenroseMark size={18} />
          vizmaya
        </span>
        <span className="flex items-center gap-5">
          <Link href="/stories" className="transition-colors hover:text-(--text)">
            All stories
          </Link>
          <Link href="/about" className="transition-colors hover:text-(--text)">
            About
          </Link>
        </span>
      </footer>
    </div>
  )
}

/** A story tile, and today's Doom v Boom right after the lead. */
function FragmentWithDaily({ children, after }: { children: ReactNode; after: ReactNode }) {
  return (
    <>
      {children}
      {after}
    </>
  )
}
