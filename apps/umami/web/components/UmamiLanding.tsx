'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { FoodDish, UmamiStory } from '@/lib/content'

// Display order + labels for the launch cuisines. Dishes from a cuisine not
// listed here (the table is food-generic) still render, appended at the end.
const CUISINES: { slug: string; label: string }[] = [
  { slug: 'india', label: 'India' },
  { slug: 'china', label: 'China' },
  { slug: 'thailand', label: 'Thailand' },
  { slug: 'indonesia', label: 'Indonesia' },
  { slug: 'japan', label: 'Japan' },
]

interface Props {
  epic: { name: string; dek: string }
  dishes: FoodDish[]
  stories: UmamiStory[]
}

export function UmamiLanding({ epic, dishes, stories }: Props) {
  const [cuisine, setCuisine] = useState<string>('all')

  const cuisineTabs = useMemo(() => {
    const counts = new Map<string, number>()
    for (const d of dishes) counts.set(d.cuisine, (counts.get(d.cuisine) ?? 0) + 1)
    const known = CUISINES.filter((c) => counts.has(c.slug))
    const extra = [...counts.keys()]
      .filter((slug) => !CUISINES.some((c) => c.slug === slug))
      .sort()
      .map((slug) => ({ slug, label: slug }))
    return [...known, ...extra].map((c) => ({ ...c, count: counts.get(c.slug) ?? 0 }))
  }, [dishes])

  const visible = useMemo(
    () => (cuisine === 'all' ? dishes : dishes.filter((d) => d.cuisine === cuisine)),
    [dishes, cuisine]
  )

  const hasSampleData = dishes.some((d) => d.tags.includes('sample-data'))

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-24">
      <header className="pt-16 pb-10 sm:pt-24">
        <p className="text-sm uppercase tracking-[0.25em] text-umami-accent">A food atlas</p>
        <h1 className="mt-3 font-display text-4xl leading-tight sm:text-6xl">{epic.name}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-umami-muted sm:text-lg">
          {epic.dek}
        </p>
        {hasSampleData && (
          <p className="mt-4 inline-block rounded-md border border-umami-chili/50 bg-umami-chili/10 px-3 py-1.5 text-xs text-umami-text/90">
            Sample data — a hand-picked starter set. The full TasteAtlas corpus lands with the
            first real scrape.
          </p>
        )}
      </header>

      {dishes.length === 0 ? (
        <EmptyCorpus />
      ) : (
        <>
          <nav className="sticky top-0 z-10 -mx-5 flex gap-2 overflow-x-auto bg-umami-bg/95 px-5 py-3 backdrop-blur">
            <CuisineTab
              label="All"
              count={dishes.length}
              active={cuisine === 'all'}
              onClick={() => setCuisine('all')}
            />
            {cuisineTabs.map((c) => (
              <CuisineTab
                key={c.slug}
                label={c.label}
                count={c.count}
                active={cuisine === c.slug}
                onClick={() => setCuisine(c.slug)}
              />
            ))}
          </nav>

          <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((dish) => (
              <DishCard key={dish.slug} dish={dish} />
            ))}
          </section>
        </>
      )}

      <StoriesStrip stories={stories} />
    </main>
  )
}

function CuisineTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-4 py-1.5 text-sm capitalize transition-colors ${
        active
          ? 'border-umami-accent bg-umami-accent text-umami-bg'
          : 'border-umami-border bg-umami-surface text-umami-muted hover:border-umami-accent/60 hover:text-umami-text'
      }`}
    >
      {label} <span className="opacity-60">{count}</span>
    </button>
  )
}

function DishCard({ dish }: { dish: FoodDish }) {
  const shownIngredients = dish.ingredients.slice(0, 4)
  const moreIngredients = dish.ingredients.length - shownIngredients.length
  return (
    <article className="flex flex-col rounded-xl border border-umami-border bg-umami-surface p-5 transition-colors hover:border-umami-accent/50">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl leading-snug">{dish.name}</h2>
        {dish.rating != null && (
          <span className="shrink-0 rounded-md bg-umami-raised px-2 py-1 text-sm text-umami-accent">
            ★ {dish.rating.toFixed(1)}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs uppercase tracking-wide text-umami-muted">
        {[dish.region, dish.category].filter(Boolean).join(' · ') || dish.cuisine}
      </p>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-umami-text/85">{dish.description}</p>
      {shownIngredients.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {shownIngredients.map((ing) => (
            <li
              key={ing}
              className="rounded-full border border-umami-border bg-umami-raised px-2.5 py-0.5 text-xs capitalize text-umami-muted"
            >
              {ing}
            </li>
          ))}
          {moreIngredients > 0 && (
            <li className="px-1 py-0.5 text-xs text-umami-muted">+{moreIngredients} more</li>
          )}
        </ul>
      )}
      <a
        href={dish.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-4 text-xs text-umami-accent/80 hover:text-umami-accent"
      >
        TasteAtlas ↗
      </a>
    </article>
  )
}

function StoriesStrip({ stories }: { stories: UmamiStory[] }) {
  return (
    <section className="mt-16">
      <h2 className="font-display text-2xl">Stories</h2>
      {stories.length === 0 ? (
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-umami-muted">
          No stories yet — the first Searching for Umami data stories are on the stove. Composed
          stories tagged to this app will appear here.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {stories.map((s) => (
            <li key={s.slug}>
              <Link
                href={`/editorial/${s.slug}`}
                className="block rounded-xl border border-umami-border bg-umami-surface p-5 transition-colors hover:border-umami-accent/50"
              >
                <span className="font-display text-lg leading-snug">{s.title}</span>
                {s.publishedAt && (
                  <span className="mt-1 block text-xs text-umami-muted">
                    {new Date(s.publishedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function EmptyCorpus() {
  return (
    <div className="rounded-xl border border-umami-border bg-umami-surface p-8 text-sm leading-relaxed text-umami-muted">
      The dish corpus isn&apos;t loaded yet. Once Supabase env is configured, migration 069 is
      applied, and <code className="text-umami-text/80">pnpm searching-for-umami:import</code> has
      run, the cuisine explorer appears here.
    </div>
  )
}
