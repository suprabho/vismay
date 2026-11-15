'use client'

import type { CSSProperties, ReactNode } from 'react'
import { ArrowUpRight } from '@phosphor-icons/react'
import type { HomeSectionDef } from '@/lib/home/sections'
import { storyMetaBits, type HomeStory } from '@/lib/home/homeShape'
import { REVEAL } from './bits'
import StoryTile, { COVER_LINK, StoryLink } from './StoryTile'

/**
 * The category sections under the wall (lib/home/sections.ts): one section
 * per story category, each in its own layout and accent so the page changes
 * pace. A
 * feature and a strip show stories live, like the wall; a ledger is type
 * only, which also keeps the page's preview count down.
 */

export interface SectionWithStories {
  def: HomeSectionDef
  stories: HomeStory[]
}

const two = (n: number) => String(n).padStart(2, '0')

/** A section's heading: the name with its last word in the accent, and what it covers. */
function SectionHead({ def, className = '' }: { def: HomeSectionDef; className?: string }) {
  return (
    <header data-reveal className={`flex flex-wrap items-end justify-between gap-x-10 gap-y-2 ${REVEAL} ${className}`}>
      <h3 id={`section-${def.category}-h`} className="font-(family-name:--serif) text-[clamp(36px,4.6vw,62px)] font-normal leading-[.98] tracking-[-.015em]">
        {def.title[0]} <em className="text-(--ba)">{def.title[1]}</em>
      </h3>
      <p className="max-w-[44ch] text-[15px] leading-[1.5] text-(--bm) sm:text-right">{def.line}</p>
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
function Feature({ def, stories }: SectionWithStories) {
  const [lead, ...rest] = stories
  return (
    <>
      <SectionHead def={def} className="mb-6 px-1" />
      <div className="grid gap-x-8 gap-y-4 lg:grid-cols-12">
        <StoryTile story={lead} index={0} lead className={`h-[460px] sm:h-[clamp(420px,44vw,600px)] lg:col-span-7 ${def.alt ? 'lg:order-2' : ''}`} />
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
function Strip({ def, stories }: SectionWithStories) {
  return (
    <>
      <SectionHead def={def} className="mb-6 px-1" />
      <ul
        tabIndex={0}
        aria-label={`${def.label} stories`}
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

/** Three live tiles on a raised band, under the section's heading. */
function Trio({ def, stories }: SectionWithStories) {
  return (
    <div className="rounded-[18px] border border-(--line) bg-(--surface) p-3">
      <SectionHead def={def} className="px-3 pb-7 pt-5 md:px-5" />
      <div className="grid gap-3 md:grid-cols-3">
        {stories.map((s, i) => (
          <StoryTile key={s.slug} story={s} index={i} className="md:h-[clamp(340px,34vw,460px)]" />
        ))}
      </div>
    </div>
  )
}

/** A numbered list in two columns, type only: on paper, or (alt) on the dark surface. */
function Ledger({ def, stories }: SectionWithStories) {
  const ground = def.alt
    ? 'border border-(--line) bg-(--surface)'
    : 'bg-(--paper) text-(--paper-ink) [--ba:var(--ink-signal)] [--bl:var(--paper-line)] [--bm:var(--paper-muted)]'
  return (
    <div className={`rounded-[18px] p-6 md:p-10 ${ground}`}>
      <SectionHead def={def} className="mb-8" />
      <ol className="grid gap-x-12 md:grid-cols-2">
        {stories.map((s, i) => (
          <HeadlineRow key={s.slug} story={s}>
            <span
              aria-hidden
              className="w-[2.1ch] flex-none font-(family-name:--serif) text-[clamp(40px,4vw,56px)] italic leading-[.9] tabular-nums text-(--ba)"
            >
              {two(i + 1)}
            </span>
          </HeadlineRow>
        ))}
      </ol>
    </div>
  )
}

const LAYOUTS = { feature: Feature, strip: Strip, trio: Trio, ledger: Ledger }

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
          {sections.map(({ def }) => (
            <a
              key={def.category}
              href={`#section-${def.category}`}
              style={{ '--ba': `var(--${def.accent})` } as CSSProperties}
              className="rounded-full border border-(--line2) px-3.5 py-1.5 text-[13px] text-(--muted) transition-colors hover:border-(--ba) hover:text-(--text)"
            >
              {def.label}
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
              style={{ '--ba': `var(--${x.def.accent})`, '--bm': 'var(--muted)', '--bl': 'var(--line)' } as CSSProperties}
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
