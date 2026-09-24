'use client'

import Link from 'next/link'
import { useEditorialStories } from '@/lib/useEditorialStories'

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function EditorialMagazine() {
  const { data: stories, isLoading, isError } = useEditorialStories()

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-surface" />
        ))}
      </div>
    )
  }

  if (isError) {
    return <p className="text-sm text-muted">Couldn’t load stories. Try again shortly.</p>
  }

  if (!stories || stories.length === 0) {
    return <p className="text-sm text-muted">No stories yet.</p>
  }

  return (
    <div className="space-y-3">
      {stories.map((s) => {
        const date = formatDate(s.publishedAt)
        return (
          <Link
            key={s.slug}
            href={`/editorial/${s.slug}`}
            className="block rounded-2xl border border-border bg-surface p-5 hover:border-muted"
          >
            <h3 className="text-lg font-semibold text-text">{s.title}</h3>
            {date && <p className="mt-2 text-sm text-muted">{date}</p>}
            <span className="mt-3 inline-block text-xs uppercase tracking-wider text-accent">
              Read story →
            </span>
          </Link>
        )
      })}
    </div>
  )
}
