'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'

export type StoryKind = 'story' | 'recap' | 'feature' | 'news' | 'board'

export type Story = {
  id: string
  kind: StoryKind
  kicker: string
  title: string
  dek: string | null
  byline: string | null
  href: string
  external: boolean
  /** A route handler (an HTML story at /s/<slug>), not a page: plain <a>, same tab. */
  document?: boolean
  /** Server-rendered thumbnail (chart SVG or image). */
  thumb: ReactNode
  /** Border tint for recap rows (the winner's colour). */
  accent?: string
}

const FILTERS: Array<{ id: 'all' | StoryKind; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'story', label: 'Stories' },
  { id: 'recap', label: 'Recaps' },
  { id: 'feature', label: 'Features' },
  { id: 'news', label: 'News' },
  { id: 'board', label: 'Boards' },
]

const PAGE = 9

function StoryLink({
  story,
  className,
  style,
  children,
}: {
  story: Story
  className: string
  style?: React.CSSProperties
  children: ReactNode
}) {
  if (story.external) {
    return (
      <a href={story.href} target="_blank" rel="noreferrer" className={className} style={style}>
        {children}
      </a>
    )
  }
  if (story.document) {
    return (
      <a href={story.href} className={className} style={style}>
        {children}
      </a>
    )
  }
  return (
    <Link href={story.href} className={className} style={style}>
      {children}
    </Link>
  )
}

export function EditorialGrid({ stories }: { stories: Story[] }) {
  const [filter, setFilter] = useState<'all' | StoryKind>('all')
  const [shown, setShown] = useState(PAGE)
  const list = stories.filter((s) => filter === 'all' || s.kind === filter)
  const [hero, ...rest] = list.slice(0, shown)
  const available = new Set(stories.map((s) => s.kind))

  return (
    <>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pt-[18px] pb-1">
        {FILTERS.filter((f) => f.id === 'all' || available.has(f.id)).map((f) => {
          const on = f.id === filter
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setFilter(f.id)
                setShown(PAGE)
              }}
              className={`min-h-9 flex-none rounded-full border px-3.5 text-[12.5px] ${
                on ? 'border-text bg-text font-semibold text-bg' : 'border-border-strong font-medium text-soft'
              }`}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-2.5 px-4 pt-3 pb-9">
        {!hero && <p className="col-span-2 text-sm text-muted">Nothing here yet.</p>}
        {hero && (
          <StoryLink story={hero} className="col-span-2 flex flex-col overflow-hidden rounded-[18px] border border-border bg-surface">
            <div className="relative h-[220px] overflow-hidden bg-well">
              {hero.thumb}
              <span className="absolute top-3 left-3 rounded-full bg-bg/80 px-2 py-1 font-mono text-[9.5px] tracking-[0.08em] text-text">
                {hero.kicker}
              </span>
            </div>
            <div className="px-4 pt-3.5 pb-4">
              <h3 className="text-2xl leading-[1.05] font-bold tracking-[-0.015em] wdth-80">{hero.title}</h3>
              {hero.dek && <p className="mt-2 line-clamp-3 text-[13px] leading-normal text-dim">{hero.dek}</p>}
              {hero.byline && <p className="mt-2.5 text-[11px] text-muted">{hero.byline}</p>}
            </div>
          </StoryLink>
        )}
        {rest.map((s) =>
          s.kind === 'recap' ? (
            <StoryLink
              key={s.id}
              story={s}
              className="col-span-2 flex overflow-hidden rounded-[18px] border border-border bg-surface"
              style={s.accent ? { borderColor: `color-mix(in srgb, ${s.accent} 35%, transparent)` } : undefined}
            >
              <div className="flex w-[132px] flex-none items-center justify-center bg-well">
                {s.thumb}
              </div>
              <div className="min-w-0 flex-1 py-3.5 pr-3.5 pl-3">
                <p className="font-mono text-[9px] tracking-[0.08em] text-muted">{s.kicker}</p>
                <h3 className="mt-1 line-clamp-3 text-[17px] leading-[1.15] font-semibold">{s.title}</h3>
                {s.dek && <p className="mt-1.5 line-clamp-2 text-xs leading-[1.45] text-dim">{s.dek}</p>}
              </div>
            </StoryLink>
          ) : (
            <StoryLink key={s.id} story={s} className="flex flex-col overflow-hidden rounded-[18px] border border-border bg-surface">
              <div className="relative flex h-[118px] items-center justify-center overflow-hidden bg-well">{s.thumb}</div>
              <div className="px-3 pt-3 pb-3.5">
                <p className="font-mono text-[9px] tracking-[0.08em] text-muted">{s.kicker}</p>
                <h3 className="mt-1 line-clamp-3 text-base leading-[1.15] font-semibold">{s.title}</h3>
              </div>
            </StoryLink>
          ),
        )}
        {list.length > shown && (
          <button
            type="button"
            onClick={() => setShown(shown + PAGE)}
            className="col-span-2 min-h-12 rounded-[14px] border border-dashed border-border-strong text-[13px] font-semibold text-soft"
          >
            More stories
          </button>
        )}
      </div>
    </>
  )
}
