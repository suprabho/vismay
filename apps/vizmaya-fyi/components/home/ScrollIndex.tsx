'use client'

import Link from 'next/link'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowRight, ArrowUpRight } from '@phosphor-icons/react'
import {
  formatStoryDate,
  storyHref,
  storyNumber,
  storyPalette,
  type HomeStory,
} from '@/lib/home/homeShape'

/**
 * The front page as one long scroll: the Scroll view, and the fallback the
 * Book, Board and Deck fall back to (no JS, a runtime that doesn't load, or a
 * reader who asks for "Read as one page"). It is also what the server renders,
 * so every story link is in the page itself.
 */

function StoryLink({ story, className, children, decorative }: { story: HomeStory; className?: string; children: ReactNode; decorative?: boolean }) {
  const href = storyHref(story)
  // A cover repeats the title link beside it: keep it out of the tab order.
  const extra = decorative ? { 'aria-hidden': true, tabIndex: -1 } : {}
  // HTML stories (/s/<slug>) are served outside the app router: a full load.
  if (story.href) {
    return (
      <a href={href} className={className} {...extra}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={className} {...extra}>
      {children}
    </Link>
  )
}

function Cover({ story, index, className = '' }: { story: HomeStory; index: number; className?: string }) {
  const p = storyPalette(story, index)
  const [failed, setFailed] = useState(false)
  return (
    <div
      className={`relative overflow-hidden rounded-[6px] bg-(--sb) ${className}`}
      style={{ '--sb': p.bg, '--sa': p.accent } as CSSProperties}
    >
      {/* The story's initial in its colours, under the cover (or instead of one that fails). */}
      <span
        aria-hidden
        className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_30%_25%,color-mix(in_srgb,var(--sa)_32%,transparent),transparent_60%)] font-(family-name:--serif) text-[clamp(64px,9vw,120px)] font-semibold text-(--sa)"
      >
        {(story.title.trim()[0] ?? '·').toUpperCase()}
      </span>
      {story.thumbnail && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={story.thumbnail}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />
      )}
    </div>
  )
}

function Meta({ story }: { story: HomeStory }) {
  const bits = [formatStoryDate(story.date), story.format].filter(Boolean)
  return (
    <p className="font-(family-name:--mono) text-[10.5px] uppercase tracking-[.16em] text-(--muted)">{bits.join(' · ')}</p>
  )
}

export default function ScrollIndex({ stories, total }: { stories: HomeStory[]; total: number }) {
  if (!stories.length) {
    return <p className="py-16 text-center text-(--muted)">No stories on this topic yet.</p>
  }
  const [lead, ...rest] = stories
  return (
    <div>
      {/* The lead story, as a feature */}
      <article className="group grid gap-8 border-y border-(--line) py-8 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:items-center md:gap-12 md:py-10">
        <StoryLink story={lead} decorative className="block">
          <Cover story={lead} index={0} className="aspect-[16/10] shadow-[0_30px_60px_-30px_rgba(12,12,16,.45)]" />
        </StoryLink>
        <div>
          <p className="font-(family-name:--mono) text-[11px] font-medium uppercase tracking-[.2em] text-(--teal)">
            Latest · No. {storyNumber(0)}
            {lead.topic ? ` · ${lead.topic}` : ''}
          </p>
          <h3 className="mt-4 font-(family-name:--serif) text-[clamp(30px,3.6vw,46px)] font-semibold leading-[1.04] tracking-[-.02em] text-balance">
            <StoryLink story={lead} className="decoration-(--teal) decoration-2 underline-offset-[6px] hover:underline">
              {lead.title}
            </StoryLink>
          </h3>
          {lead.subtitle && <p className="mt-4 max-w-[54ch] text-[17px] leading-[1.65] text-(--muted)">{lead.subtitle}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-5">
            <StoryLink
              story={lead}
              className="inline-flex items-center gap-2 rounded-[3px] bg-(--ink) px-5 py-3 font-(family-name:--mono) text-[11px] uppercase tracking-[.16em] text-(--cream) transition-colors hover:bg-(--teal) hover:text-(--ink)"
            >
              Read the story <ArrowRight size={14} weight="bold" />
            </StoryLink>
            <Meta story={lead} />
          </div>
        </div>
      </article>

      {/* Everything else, numbered */}
      <ol className="divide-y divide-(--line) border-b border-(--line)">
        {rest.map((s, k) => {
          const i = k + 1
          return (
            <li key={s.slug} className="group grid grid-cols-[48px_minmax(0,1fr)] gap-x-4 py-6 sm:grid-cols-[64px_minmax(0,1fr)_180px] sm:gap-x-8 md:py-7">
              <span className="font-(family-name:--serif) text-[26px] font-semibold leading-none tracking-[-.02em] text-(--teal) tabular-nums sm:text-[32px]">
                {storyNumber(i)}
              </span>
              <div className="min-w-0">
                {(s.topic || s.format) && (
                  <p className="mb-2 font-(family-name:--mono) text-[10.5px] font-medium uppercase tracking-[.18em] text-(--muted)">
                    {[s.topic, s.format].filter(Boolean).join(' · ')}
                  </p>
                )}
                <h3 className="font-(family-name:--serif) text-[22px] font-semibold leading-[1.15] tracking-[-.01em] text-balance sm:text-[27px]">
                  <StoryLink story={s} className="decoration-(--teal) decoration-2 underline-offset-[5px] hover:underline">
                    {s.title}
                  </StoryLink>
                </h3>
                {s.subtitle && <p className="mt-2 line-clamp-2 max-w-[62ch] text-[15.5px] leading-[1.6] text-(--muted)">{s.subtitle}</p>}
                <div className="mt-3">
                  <Meta story={{ ...s, format: undefined }} />
                </div>
              </div>
              <StoryLink story={s} decorative className="hidden sm:block">
                <Cover story={s} index={i} className="aspect-[4/3]" />
              </StoryLink>
            </li>
          )
        })}
      </ol>

      <div className="mt-8 flex justify-end">
        <Link
          href="/stories"
          className="inline-flex items-center gap-2 font-(family-name:--mono) text-[11px] uppercase tracking-[.18em] text-(--ink) underline-offset-4 hover:underline"
        >
          All {total} stories in the archive <ArrowUpRight size={14} weight="bold" />
        </Link>
      </div>
    </div>
  )
}
