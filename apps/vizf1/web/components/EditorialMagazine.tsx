'use client'

import Link from 'next/link'

// TODO(vizf1-scaffold): replace with stories fetched from the vizmaya-fyi
// backend (filter by vertical === 'f1'). For now, a static placeholder list
// keeps the Editorial route renderable.
const PLACEHOLDER_STORIES: Array<{ slug: string; title: string; dek: string }> = [
  {
    slug: 'f1-2024-season-in-charts',
    title: 'The 2024 season, in charts',
    dek: 'Every race told through standings shifts, qualifying gaps, and lap-by-lap position duels.',
  },
  {
    slug: 'the-mclaren-comeback',
    title: 'The McLaren comeback',
    dek: 'How Woking moved from midfield mediocrity to constructors’ contender in eighteen months.',
  },
]

export function EditorialMagazine() {
  return (
    <div className="space-y-3">
      {PLACEHOLDER_STORIES.map((s) => (
        <Link
          key={s.slug}
          href={`/editorial/${s.slug}`}
          className="block rounded-2xl border border-border bg-surface p-5 hover:border-muted"
        >
          <h3 className="text-lg font-semibold text-text">{s.title}</h3>
          <p className="mt-2 text-sm text-muted">{s.dek}</p>
          <span className="mt-3 inline-block text-xs uppercase tracking-wider text-accent">
            Read story →
          </span>
        </Link>
      ))}
    </div>
  )
}
