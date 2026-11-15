'use client'

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from '@phosphor-icons/react'
import { storyHref, storyMetaBits, storyPalette, storyPreviewUrl, type HomeStory } from '@/lib/home/homeShape'
import { REVEAL } from './bits'
import LivePreview from './LivePreview'

/** A story as the home page shows it: the link, and the live tile the wall and the beats share. */

/** A link over its whole tile, with the focus ring drawn around the tile. */
export const COVER_LINK =
  'outline-none after:absolute after:inset-0 after:z-10 after:rounded-[14px] focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-(--text)'

export function StoryLink({ story, className, children }: { story: HomeStory; className?: string; children: ReactNode }) {
  const href = storyHref(story)
  // HTML stories (/s/<slug>) are served outside the app router: a full load.
  if (story.href) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}

export default function StoryTile({ story, index, lead, className = '' }: { story: HomeStory; index: number; lead?: boolean; className?: string }) {
  const p = storyPalette(story, index)
  const meta = storyMetaBits(story)
  return (
    <article
      data-reveal
      style={{ '--sb': p.bg, '--st': p.text, '--sm': p.muted, '--sa': p.accent } as CSSProperties}
      className={`group relative flex h-[420px] flex-col overflow-hidden rounded-[14px] bg-(--sb) text-(--st) sm:h-auto ${REVEAL} ${className}`}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* A glow in the story's colours, until (or instead of) the story itself. */}
        <span
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,color-mix(in_srgb,var(--sa)_32%,transparent),transparent_62%)]"
        />
        <LivePreview
          src={storyPreviewUrl(story)}
          title={story.title}
          className="transition-transform duration-700 ease-out group-hover:scale-[1.02]"
        />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-(--sb) to-transparent" />
      </div>
      <div className={`flex-none ${lead ? 'px-5 pb-5 pt-3 sm:px-7 sm:pb-6' : 'px-4 pb-4 pt-2.5'}`}>
        <h3
          className={`font-(family-name:--serif) font-normal text-balance ${
            lead ? 'text-[clamp(30px,3.6vw,52px)] leading-[1] tracking-[-.015em]' : 'line-clamp-2 text-[22px] leading-[1.08]'
          }`}
        >
          <StoryLink story={story} className={COVER_LINK}>
            {story.title}
          </StoryLink>
        </h3>
        {lead && story.subtitle && <p className="mt-2 line-clamp-2 max-w-[64ch] text-[15px] leading-[1.5] text-(--sm)">{story.subtitle}</p>}
        <p className="mt-2 flex items-center justify-between gap-3 font-(family-name:--mono) text-[11px] uppercase tracking-[.05em] text-(--sm)">
          <span className="truncate">{meta.join(' · ')}</span>
          <ArrowUpRight
            size={14}
            weight="bold"
            aria-hidden
            className="flex-none text-(--sa) opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
          />
        </p>
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[14px] border border-[color-mix(in_srgb,var(--st)_10%,transparent)] transition-colors duration-300 group-hover:border-(--sa)"
      />
    </article>
  )
}
