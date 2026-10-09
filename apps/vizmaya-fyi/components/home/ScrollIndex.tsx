'use client'

import Link from 'next/link'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowRight, ArrowUpRight } from '@phosphor-icons/react'
import {
  storyHref,
  storyMetaBits,
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
      {/* A glow in the story's colours, under the cover (or instead of one that fails). */}
      <span
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,color-mix(in_srgb,var(--sa)_30%,transparent),transparent_62%)]"
      />
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
  return (
    <p className="font-(family-name:--mono) text-[11px] uppercase tracking-[.06em] text-(--dim)">{storyMetaBits(story).join(' · ')}</p>
  )
}

const TITLE_LINK = 'decoration-(--signal) decoration-1 underline-offset-[6px] transition-colors hover:underline'

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
          <Cover story={lead} index={0} className="aspect-[16/10] shadow-[0_40px_80px_-40px_rgba(0,0,0,.8)]" />
        </StoryLink>
        <div>
          <h3 className="font-(family-name:--serif) text-[clamp(38px,4.4vw,60px)] font-normal leading-[.98] tracking-[-.015em] text-balance">
            <StoryLink story={lead} className={TITLE_LINK}>
              {lead.title}
            </StoryLink>
          </h3>
          {lead.subtitle && <p className="mt-5 max-w-[54ch] text-[17px] leading-[1.65] text-(--muted)">{lead.subtitle}</p>}
          <div className="mt-7 flex flex-wrap items-center gap-5">
            <StoryLink
              story={lead}
              className="inline-flex items-center gap-2 rounded-full bg-(--signal) px-5 py-3 text-[14px] font-medium text-(--bg) transition-colors hover:bg-(--text)"
            >
              Read the story <ArrowRight size={15} weight="bold" />
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
            <li key={s.slug} className="group grid grid-cols-[44px_minmax(0,1fr)] gap-x-4 py-6 sm:grid-cols-[64px_minmax(0,1fr)_180px] sm:gap-x-8 md:py-7">
              <span className="font-(family-name:--serif) text-[30px] italic leading-none text-(--signal) tabular-nums sm:text-[40px]">
                {storyNumber(i)}
              </span>
              <div className="min-w-0">
                <h3 className="font-(family-name:--serif) text-[26px] font-normal leading-[1.05] tracking-[-.01em] text-balance sm:text-[34px]">
                  <StoryLink story={s} className={TITLE_LINK}>
                    {s.title}
                  </StoryLink>
                </h3>
                {s.subtitle && <p className="mt-2 line-clamp-2 max-w-[62ch] text-[15.5px] leading-[1.6] text-(--muted)">{s.subtitle}</p>}
                <div className="mt-3">
                  <Meta story={s} />
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
          className="inline-flex items-center gap-2 text-[14px] font-medium text-(--text) underline decoration-(--signal) underline-offset-[6px] hover:text-(--signal)"
        >
          All {total} stories in the archive <ArrowUpRight size={15} weight="bold" />
        </Link>
      </div>
    </div>
  )
}
