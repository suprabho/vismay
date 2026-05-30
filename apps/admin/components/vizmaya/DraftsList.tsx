'use client'

import Link from 'next/link'
import { useState } from 'react'
import MoveStoryControl from './MoveStoryControl'

type Draft = { slug: string; title: string; status: string }

/**
 * "Drafts · Unassigned" list on the admin dashboard. Stories with no owning app
 * land here until an admin moves them into one. Moving a story to an app drops
 * it from the list locally (it's no longer unassigned).
 */
export default function DraftsList({ stories }: { stories: Draft[] }) {
  const [drafts, setDrafts] = useState<Draft[]>(stories)

  if (drafts.length === 0) return null

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-neutral-300">Drafts · Unassigned</h2>
      <p className="text-xs text-neutral-500">
        Stories with no app yet. Assign one to publish it under that app.
      </p>
      <ul className="grid gap-2">
        {drafts.map((s) => (
          <li
            key={s.slug}
            className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 p-3"
          >
            <Link href={`/vizmaya/${s.slug}`} className="min-w-0 hover:underline">
              <div className="font-medium truncate">{s.title}</div>
              <div className="text-xs text-neutral-500 truncate">
                {s.slug} · {s.status}
              </div>
            </Link>
            <MoveStoryControl
              slug={s.slug}
              currentAppSlug={null}
              onMoved={(appSlug) => {
                if (appSlug !== null) {
                  setDrafts((cur) => cur.filter((d) => d.slug !== s.slug))
                }
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
