'use client'

import type { CSSProperties, ReactNode } from 'react'
import { ArrowUpRight } from '@phosphor-icons/react'
import type { Beat } from '@/lib/home/beats'
import { storyMetaBits, type HomeStory } from '@/lib/home/homeShape'
import { REVEAL } from './bits'
import StoryTile, { COVER_LINK, StoryLink } from './StoryTile'

/**
 * The beats under the wall (lib/home/beats.ts): one section per kind of
 * story, each in its own layout and accent so the page changes pace. A
 * feature and a strip show stories live, like the wall; a ledger is type
 * only, which also keeps the page's preview count down.
 */

export interface BeatWithStories {
  beat: Beat
  stories: HomeStory[]
}

const two = (n: number) => String(n).padStart(2, '0')

/** A beat's heading: the name with its last word in the accent, and what it covers. */
function BeatHead({ beat, className = '' }: { beat: Beat; className?: string }) {
  return (
    <header data-reveal className={`flex flex-wrap items-end justify-between gap-x-10 gap-y-2 ${REVEAL} ${className}`}>
      <h3 id={`beat-${beat.id}-h`} className="font-(family-name:--serif) text-[clamp(36px,4.6vw,62px)] font-normal leading-[.98] tracking-[-.015em]">
        {beat.title[0]} <em className="text-(--ba)">{beat.title[1]}</em>
      </h3>
      <p className="max-w-[44ch] text-[15px] leading-[1.5] text-(--bm) sm:text-right">{beat.line}</p>
    </header>
  )
}

/** A story as a line of type: its title, a line of its dek and its meta. */
function HeadlineRow({ story, children }: { story: HomeStory; children?: ReactNode }) {
  const meta = storyMetaBits(story)
  return (
    <li data-reveal className={`group relative flex flex-1 gap-5 border-t border-(--bl) py-4 ${REVEAL}`}>
      {children}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <h4 className="font-(family-name:--serif) text-[clamp(22px,2vw,28px)] font-normal leading-[1.1] text-balance transition-colors group-hover:text-(--ba)">
          <StoryLink story={story} className={`${COVER_LINK} after:rounded-none`}>
            {story.title}
          </StoryLink>
        </h4>
        {story.subtitle && <p className="mt-1.5 line-clamp-2 text-[14px] leading-[1.5] text-(--bm)">{story.subtitle}</p>}
        <p className="mt-2 flex items-center justify-between gap-3 font-(family-name:--mono) text-[11px] uppercase tracking-[.05em] text-(--bm)">
          <span className="truncate">{meta.join(' · ')}</span>
          <ArrowUpRight
            size={14}
            weight="bold"
            aria-hidden
            className="flex-none text-(--ba) opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
          />
        </p>
      </div>
    </li>
  )
}

// ── the layouts ───────────────────────────────────────────────────────────

/** One story large and live, the next few as headlines beside it. */
function Feature({ beat, stories }: BeatWithStories) {
  const [lead, ...rest] = stories
  return (
    <>
      <BeatHead beat={beat} className="mb-6 px-1" />
      <div className="grid gap-x-8 gap-y-4 lg:grid-cols-12">
        <StoryTile story={lead} index={0} lead className={`h-[460px] sm:h-[clamp(420px,44vw,600px)] lg:col-span-7 ${beat.alt ? 'lg:order-2' : ''}`} />
        <ol className="flex flex-col border-b border-(--bl) lg:col-span-5">
          {rest.map((s) => (
            <HeadlineRow key={s.slug} story={s} />
          ))}
        </ol>
      </div>
    </>
  )
}

/** Tall tiles in a row that scrolls sideways, out to the edges of the page. */
function Strip({ beat, stories }: BeatWithStories) {
  return (
    <>
      <BeatHead beat={beat} className="mb-6 px-1" />
      <ul
        tabIndex={0}
        aria-label={`${beat.label} stories`}
        className="-mx-3 flex snap-x snap-mandatory scroll-px-3 gap-3 overflow-x-auto px-3 pb-3 outline-none [scrollbar-color:var(--line2)_transparent] [scrollbar-width:thin] focus-visible:outline-1 focus-visible:outline-(--line2) sm:-mx-4 sm:scroll-px-4 sm:px-4"
      >
        {stories.map((s, i) => (
          <li key={s.slug} className="h-[420px] w-[74vw] max-w-[320px] flex-none snap-start sm:h-[480px] sm:w-[300px]">
            <StoryTile story={s} index={i} className="h-full!" />
          </li>
        ))}
      </ul>
    </>
  )
}

/** Three live tiles on a raised band, under the beat's heading. */
function Trio({ beat, stories }: BeatWithStories) {
  return (
    <div className="rounded-[18px] border border-(--line) bg-(--surface) p-3">
      <BeatHead beat={beat} className="px-3 pb-7 pt-5 md:px-5" />
      <div className="grid gap-3 md:grid-cols-3">
        {stories.map((s, i) => (
          <StoryTile key={s.slug} story={s} index={i} className="md:h-[clamp(340px,34vw,460px)]" />
        ))}
      </div>
    </div>
  )
}

/**
 * A numbered list in two columns, type only: on paper, or (alt) on the dark
 * surface. The numerals are the stories' own marks when every one has one
 * (the ranks of The 100), else their place in the list.
 */
function Ledger({ beat, stories }: BeatWithStories) {
  const marked = stories.every((s) => s.mark)
  const ground = beat.alt
    ? 'border border-(--line) bg-(--surface)'
    : 'bg-(--paper) text-(--paper-ink) [--ba:var(--ink-signal)] [--bl:var(--paper-line)] [--bm:var(--paper-muted)]'
  return (
    <div className={`rounded-[18px] p-6 md:p-10 ${ground}`}>
      <BeatHead beat={beat} className="mb-8" />
      <ol className="grid gap-x-12 md:grid-cols-2">
        {stories.map((s, i) => (
          <HeadlineRow key={s.slug} story={s}>
            <span
              aria-hidden
              className="w-[2.1ch] flex-none font-(family-name:--serif) text-[clamp(40px,4vw,56px)] italic leading-[.9] tabular-nums text-(--ba)"
            >
              {marked ? s.mark : two(i + 1)}
            </span>
          </HeadlineRow>
        ))}
      </ol>
    </div>
  )
}

const LAYOUTS = { feature: Feature, strip: Strip, trio: Trio, ledger: Ledger }

// ── the sections ──────────────────────────────────────────────────────────

export default function BeatSections({ beats }: { beats: BeatWithStories[] }) {
  if (beats.length === 0) return null
  return (
    <section id="beats" aria-labelledby="beats-h" className="mt-20 scroll-mt-20 md:mt-28">
      <div data-reveal className={`mb-12 flex flex-wrap items-end justify-between gap-x-10 gap-y-5 px-1 md:mb-16 ${REVEAL}`}>
        <h2 id="beats-h" className="font-(family-name:--serif) text-[clamp(44px,6.4vw,84px)] font-normal leading-[.95] tracking-[-.02em]">
          The <em className="text-(--signal)">beats</em>
        </h2>
        <nav aria-label="Beats" className="flex flex-wrap gap-2">
          {beats.map(({ beat }) => (
            <a
              key={beat.id}
              href={`#beat-${beat.id}`}
              style={{ '--ba': `var(--${beat.accent})` } as CSSProperties}
              className="rounded-full border border-(--line2) px-3.5 py-1.5 text-[13px] text-(--muted) transition-colors hover:border-(--ba) hover:text-(--text)"
            >
              {beat.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-20 md:gap-28">
        {beats.map((b) => {
          const Layout = LAYOUTS[b.beat.layout]
          return (
            <section
              key={b.beat.id}
              id={`beat-${b.beat.id}`}
              aria-labelledby={`beat-${b.beat.id}-h`}
              style={{ '--ba': `var(--${b.beat.accent})`, '--bm': 'var(--muted)', '--bl': 'var(--line)' } as CSSProperties}
              className="scroll-mt-20"
            >
              <Layout {...b} />
            </section>
          )
        })}
      </div>
    </section>
  )
}
