'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { categoryArchiveHref, headlineFigure, type HomeSectionDef } from '@/lib/home/sections'
import { storyMetaBits, storyPalette, storyPreviewUrl, type HomeStory } from '@/lib/home/homeShape'
import { REVEAL } from './bits'
import LivePreview from './LivePreview'
import StoryTile, { COVER_LINK, StoryLink } from './StoryTile'

/**
 * The category sections under the wall (lib/home/sections.ts): one section
 * per story category, each in a layout of its own so the page changes pace.
 * Money leads with the number in each headline, technology is a strip to
 * page through, science a numbered list on paper, politics a mosaic, history
 * a row of framed plates and society a set of newspaper columns. The ledger
 * and the columns are type only, which also keeps the page's preview count
 * down.
 */

export interface SectionWithStories {
  def: HomeSectionDef
  stories: HomeStory[]
  total: number
}

const two = (n: number) => String(n).padStart(2, '0')
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

/**
 * A section's heading: the name with its last word in the accent, what it
 * covers, and the way to the rest of the category. `aside` sits beside the
 * link (the strip's arrows).
 */
function SectionHead({ def, total, aside, className = '' }: { def: HomeSectionDef; total: number; aside?: ReactNode; className?: string }) {
  return (
    <header data-reveal className={`flex flex-wrap items-end justify-between gap-x-10 gap-y-4 ${REVEAL} ${className}`}>
      <div className="min-w-0">
        <h3 id={`section-${def.category}-h`} className="font-(family-name:--serif) text-[clamp(36px,4.6vw,62px)] font-normal leading-[.98] tracking-[-.015em]">
          {def.title[0]} <em className="text-(--ba)">{def.title[1]}</em>
        </h3>
        <p className="mt-3 max-w-[52ch] text-[15px] leading-[1.5] text-(--bm)">{def.line}</p>
      </div>
      <div className="flex items-center gap-4">
        <Link
          href={categoryArchiveHref(def.category)}
          className="group/all inline-flex items-center gap-2 rounded-full border border-(--bl2) px-4 py-2 text-[13px] font-medium transition-colors hover:border-(--ba) hover:text-(--ba)"
        >
          All {total} stories
          <ArrowRight size={13} weight="bold" aria-hidden className="transition-transform group-hover/all:translate-x-0.5" />
        </Link>
        {aside}
      </div>
    </header>
  )
}

/** A story's meta line, with the arrow that shows on hover. */
function MetaLine({ story, className = '' }: { story: HomeStory; className?: string }) {
  return (
    <p className={`flex items-center justify-between gap-3 font-(family-name:--mono) text-[11px] uppercase tracking-[.05em] text-(--bm) ${className}`}>
      <span className="truncate">{storyMetaBits(story).join(' · ')}</span>
      <ArrowUpRight
        size={14}
        weight="bold"
        aria-hidden
        className="flex-none text-(--ba) opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      />
    </p>
  )
}

/** A story as type: its title, a line or two of its dek and its meta, under whatever leads it. */
function Headline({ story, dek = 2, size = 'text-[clamp(22px,2vw,28px)]' }: { story: HomeStory; dek?: 2 | 4; size?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <h4 className={`font-(family-name:--serif) font-normal leading-[1.1] text-balance transition-colors group-hover:text-(--ba) ${size}`}>
        <StoryLink story={story} className={`${COVER_LINK} after:rounded-none`}>
          {story.title}
        </StoryLink>
      </h4>
      {story.subtitle && (
        <p className={`mt-1.5 text-[14px] leading-[1.5] text-(--bm) ${dek === 4 ? 'line-clamp-4' : 'line-clamp-2'}`}>{story.subtitle}</p>
      )}
      <MetaLine story={story} className="mt-auto pt-2.5" />
    </div>
  )
}

// ── the layouts ───────────────────────────────────────────────────────────

/** Money: one story large and live; beside it, headlines led by the number each is built on. */
function Figures({ def, stories, total }: SectionWithStories) {
  const [lead, ...rest] = stories
  return (
    <>
      <SectionHead def={def} total={total} className="mb-7 px-1" />
      <div className="grid gap-x-10 gap-y-4 lg:grid-cols-12">
        <StoryTile story={lead} index={0} lead className="h-[460px] sm:h-[clamp(420px,44vw,620px)] lg:col-span-7" />
        <ol className="flex flex-col border-b border-(--bl) lg:col-span-5">
          {rest.map((s) => {
            const figure = headlineFigure(s.title)
            return (
              <li key={s.slug} data-reveal className={`group relative flex flex-1 flex-col justify-center border-t border-(--bl) py-4 ${REVEAL}`}>
                {figure && (
                  <span aria-hidden className="mb-1.5 font-(family-name:--serif) text-[clamp(34px,3.2vw,48px)] leading-[.95] tracking-[-.02em] tabular-nums text-(--ba)">
                    {figure}
                  </span>
                )}
                <h4 className="font-(family-name:--serif) text-[clamp(20px,1.7vw,24px)] font-normal leading-[1.15] text-balance">
                  <StoryLink story={s} className={`${COVER_LINK} after:rounded-none`}>
                    {s.title}
                  </StoryLink>
                </h4>
                {/* A headline with no number to lead it gets a line of its dek instead. */}
                {!figure && s.subtitle && <p className="mt-1.5 line-clamp-1 text-[14px] leading-[1.5] text-(--bm)">{s.subtitle}</p>}
                <MetaLine story={s} className="mt-2" />
              </li>
            )
          })}
        </ol>
      </div>
    </>
  )
}

/** Technology: tall live tiles in a row to page through, on a dotted ground that runs to the page's edges. */
function Strip({ def, stories, total }: SectionWithStories) {
  const list = useRef<HTMLUListElement>(null)
  const [edge, setEdge] = useState({ start: true, end: false })
  useEffect(() => {
    const el = list.current
    if (!el) return
    const update = () => setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [stories.length])
  const page = (dir: 1 | -1) => list.current?.scrollBy({ left: dir * list.current.clientWidth * 0.8, behavior: 'smooth' })
  const arrow =
    'grid size-10 place-items-center rounded-full border border-(--bl2) transition-colors hover:border-(--ba) hover:text-(--ba) disabled:pointer-events-none disabled:opacity-30'
  return (
    <div className="-mx-3 bg-[radial-gradient(var(--line2)_1px,transparent_1.5px)] bg-size-[22px_22px] px-3 py-10 sm:-mx-4 sm:px-4 md:py-14">
      <SectionHead
        def={def}
        total={total}
        className="mb-7 px-1"
        aside={
          <span className="hidden gap-2 sm:flex">
            <button type="button" onClick={() => page(-1)} disabled={edge.start} aria-label={`Earlier ${def.label} stories`} className={arrow}>
              <CaretLeft size={16} weight="bold" aria-hidden />
            </button>
            <button type="button" onClick={() => page(1)} disabled={edge.end} aria-label={`More ${def.label} stories`} className={arrow}>
              <CaretRight size={16} weight="bold" aria-hidden />
            </button>
          </span>
        }
      />
      <ul
        ref={list}
        tabIndex={0}
        aria-label={`${def.label} stories`}
        className="-mx-3 flex snap-x snap-mandatory scroll-px-3 gap-3 overflow-x-auto px-3 outline-none [scrollbar-width:none] focus-visible:outline-1 focus-visible:outline-(--line2) sm:-mx-4 sm:scroll-px-4 sm:px-4 [&::-webkit-scrollbar]:hidden"
      >
        {stories.map((s, i) => (
          <li key={s.slug} className="w-[74vw] max-w-[320px] flex-none snap-start sm:w-[300px]">
            <p aria-hidden className="mb-2 flex items-center gap-3 px-1 font-(family-name:--mono) text-[11px] tabular-nums text-(--dim)">
              <span className="text-(--ba)">{two(i + 1)}</span>
              <span className="h-px flex-1 bg-(--line2)" />
              <span>{two(stories.length)}</span>
            </p>
            <div className="h-[400px] sm:h-[460px]">
              <StoryTile story={s} index={i} className="h-full!" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Science: a numbered list in two columns, type only, on paper. */
function Ledger({ def, stories, total }: SectionWithStories) {
  return (
    <div className="rounded-[18px] bg-(--paper) p-6 text-(--paper-ink) [--ba:var(--ink-signal)] [--bl2:var(--paper-line)] [--bl:var(--paper-line)] [--bm:var(--paper-muted)] md:p-10">
      <SectionHead def={def} total={total} className="mb-9" />
      <ol className="grid gap-x-12 md:grid-cols-2">
        {stories.map((s, i) => (
          <li key={s.slug} data-reveal className={`group relative flex gap-5 border-t border-(--bl) py-5 ${REVEAL}`}>
            <span aria-hidden className="w-[2.1ch] flex-none font-(family-name:--serif) text-[clamp(40px,4vw,56px)] italic leading-[.9] tabular-nums text-(--ba)">
              {two(i + 1)}
            </span>
            <Headline story={s} />
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Politics: one story large and live, two more stacked beside it. */
function Mosaic({ def, stories, total }: SectionWithStories) {
  return (
    <>
      <SectionHead def={def} total={total} className="mb-7 px-1" />
      <div className="grid gap-3 sm:grid-cols-2 lg:auto-rows-[clamp(260px,24vw,340px)] lg:grid-cols-12">
        {stories.map((s, i) => (
          <StoryTile
            key={s.slug}
            story={s}
            index={i}
            lead={i === 0}
            className={i === 0 ? 'h-[460px] sm:col-span-2 sm:h-[480px] lg:col-span-8 lg:row-span-2 lg:h-auto' : 'sm:h-[380px] lg:col-span-4 lg:h-auto'}
          />
        ))}
      </div>
    </>
  )
}

/** History: framed live previews in a row, numbered and captioned underneath like the plates of a book. */
function Plates({ def, stories, total }: SectionWithStories) {
  return (
    <>
      <SectionHead def={def} total={total} className="mb-8 px-1" />
      <ol className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4 lg:gap-x-6">
        {stories.map((s, i) => {
          const p = storyPalette(s, i)
          return (
            <li key={s.slug} data-reveal className={`group relative flex flex-col ${REVEAL}`}>
              <div className="rounded-[6px] border border-(--bl2) p-2 transition-colors duration-300 group-hover:border-(--ba) sm:p-2.5">
                <div
                  style={{ '--sb': p.bg, '--sa': p.accent } as CSSProperties}
                  className="relative aspect-[4/5] overflow-hidden rounded-[2px] bg-(--sb)"
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,color-mix(in_srgb,var(--sa)_32%,transparent),transparent_62%)]"
                  />
                  <LivePreview src={storyPreviewUrl(s)} title={s.title} className="transition-transform duration-700 ease-out group-hover:scale-[1.03]" />
                </div>
              </div>
              <p aria-hidden className="mt-4 font-(family-name:--serif) text-[20px] italic leading-none text-(--ba)">
                {ROMAN[i]}
              </p>
              <div className="mt-2 flex flex-1 flex-col">
                <Headline story={s} size="text-[clamp(19px,1.7vw,24px)]" />
              </div>
            </li>
          )
        })}
      </ol>
    </>
  )
}

/** Society: newspaper columns between rules, type only; the first story is set larger. */
function Columns({ def, stories, total }: SectionWithStories) {
  return (
    <div className="border-y border-(--bl2) py-9 md:py-12">
      <SectionHead def={def} total={total} className="mb-9 px-1" />
      <ol className="grid gap-y-0 md:grid-cols-3">
        {stories.map((s, i) => (
          <li
            key={s.slug}
            data-reveal
            className={`group relative flex border-t border-(--bl) py-5 md:border-l md:px-7 md:[&:nth-child(3n+1)]:border-l-0 md:[&:nth-child(3n+1)]:pl-1 md:[&:nth-child(3n)]:pr-1 ${REVEAL}`}
          >
            <Headline story={s} dek={4} size={i === 0 ? 'text-[clamp(26px,2.6vw,36px)]' : 'text-[clamp(21px,1.8vw,25px)]'} />
          </li>
        ))}
      </ol>
    </div>
  )
}

const LAYOUTS = { figures: Figures, strip: Strip, ledger: Ledger, mosaic: Mosaic, plates: Plates, columns: Columns }

// ── the sections ──────────────────────────────────────────────────────────

export default function CategorySections({ sections }: { sections: SectionWithStories[] }) {
  if (sections.length === 0) return null
  return (
    <section id="sections" aria-labelledby="sections-h" className="mt-20 scroll-mt-20 md:mt-28">
      <div data-reveal className={`mb-12 flex flex-wrap items-end justify-between gap-x-10 gap-y-5 px-1 md:mb-16 ${REVEAL}`}>
        <h2 id="sections-h" className="font-(family-name:--serif) text-[clamp(44px,6.4vw,84px)] font-normal leading-[.95] tracking-[-.02em]">
          By <em className="text-(--signal)">subject</em>
        </h2>
        <nav aria-label="Subjects" className="flex flex-wrap gap-2">
          {sections.map(({ def, total }) => (
            <a
              key={def.category}
              href={`#section-${def.category}`}
              style={{ '--ba': `var(--${def.accent})` } as CSSProperties}
              className="group/chip inline-flex items-center gap-2 rounded-full border border-(--line2) py-1.5 pl-3 pr-3.5 text-[13px] text-(--muted) transition-colors hover:border-(--ba) hover:text-(--text)"
            >
              <span aria-hidden className="size-1.5 rounded-full bg-(--ba)" />
              {def.label}
              <span className="font-(family-name:--mono) text-[11px] tabular-nums text-(--dim)">{total}</span>
            </a>
          ))}
        </nav>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-20 md:gap-28">
        {sections.map((x) => {
          const Layout = LAYOUTS[x.def.layout]
          return (
            <section
              key={x.def.category}
              id={`section-${x.def.category}`}
              aria-labelledby={`section-${x.def.category}-h`}
              style={{ '--ba': `var(--${x.def.accent})`, '--bm': 'var(--muted)', '--bl': 'var(--line)', '--bl2': 'var(--line2)' } as CSSProperties}
              className="scroll-mt-20"
            >
              <Layout {...x} />
            </section>
          )
        })}
      </div>
    </section>
  )
}
