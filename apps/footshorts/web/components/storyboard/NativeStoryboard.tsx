'use client'

import Link from 'next/link'
import { Suspense, use } from 'react'
import { loadVertical, registerVerticalLoader } from '@vismay/viz-engine'
import type { Storyboard } from '@/lib/storyboards/types'
import { StoryboardLayer } from './StoryboardLayer'

// Client-side vertical boot — idempotent. loadVertical caches per slug and
// registerVerticalLoader just overwrites the (identical) loader closure.
registerVerticalLoader('footshorts', () =>
  import('@vismay/footshorts-viz').then((m) => m.register()),
)
const footshortsReady = loadVertical('footshorts')

// Widgets render at width/height 100% inside their frame, so the frame needs an
// explicit height. The animated board and the chart want more room.
function frameHeight(type: string): string {
  if (type === 'fs:tactics-board') return 'h-[460px]'
  if (type === 'fs:standings-over-matchdays') return 'h-[360px]'
  if (type === 'fs:standings-table' || type === 'fs:bracket') return 'min-h-[320px]'
  return 'min-h-[220px]'
}

export default function NativeStoryboard({ storyboard }: { storyboard: Storyboard }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <Link
        href="/feed"
        aria-label="Back to feed"
        className="fixed left-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface/80 text-text backdrop-blur transition-colors hover:bg-surface"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>

      <article className="mx-auto max-w-2xl px-5 pb-24 pt-20">
        <header className="border-b border-border pb-8">
          <span
            className="mb-3 inline-block h-1 w-12 rounded-full"
            style={{ backgroundColor: storyboard.accent }}
          />
          <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{storyboard.title}</h1>
          <p className="mt-4 text-base leading-relaxed text-muted">{storyboard.subtitle}</p>
          <p className="mt-4 text-xs uppercase tracking-wider text-muted">{storyboard.byline}</p>
        </header>

        <Suspense
          fallback={
            <div className="flex h-64 items-center justify-center text-sm text-muted">
              Loading widgets…
            </div>
          }
        >
          <Sections storyboard={storyboard} />
        </Suspense>
      </article>
    </div>
  )
}

function Sections({ storyboard }: { storyboard: Storyboard }) {
  use(footshortsReady)
  return (
    <>
      {storyboard.sections.map((section) => (
        <section key={section.id} className="mt-14">
          <h2 className="text-xl font-semibold">{section.heading}</h2>
          <div className="mt-3 space-y-3">
            {section.prose.map((p, i) => (
              <p key={i} className="text-[15px] leading-relaxed text-text/90">
                {p}
              </p>
            ))}
          </div>
          <div className={`mt-6 flex w-full items-center justify-center ${frameHeight(section.layer.type)}`}>
            <StoryboardLayer layer={section.layer} />
          </div>
        </section>
      ))}
    </>
  )
}
