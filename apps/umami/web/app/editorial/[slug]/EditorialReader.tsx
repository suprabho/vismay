'use client'

import Link from 'next/link'
import { StoryEmbed } from '@vismay/story-embed/web'

// vizmaya.fyi renders the story (the shared Viz story view). We embed it via
// StoryEmbed and overlay umami's back-button chrome on top — no scrollytelling
// re-implementation here. Same pattern as footshorts/vizf1.
export default function EditorialReader({ slug }: { slug: string }) {
  return (
    <StoryEmbed slug={slug}>
      <Link
        href="/"
        aria-label="Back to Searching for Umami"
        className="absolute left-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-umami-border bg-umami-surface/80 text-umami-text backdrop-blur transition-colors hover:bg-umami-surface"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="h-5 w-5"
        >
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </StoryEmbed>
  )
}
