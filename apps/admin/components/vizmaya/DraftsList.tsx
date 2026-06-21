'use client'

import Link from 'next/link'
import { useState } from 'react'
import MoveStoryControl from './MoveStoryControl'

type Draft = { slug: string; title: string; status: string }

/**
 * "Drafts · Unassigned" list on the admin dashboard. Stories with no owning app
 * land here until an admin moves them into one. Moving a story to an app drops
 * it from the list locally (it's no longer unassigned); deleting one removes it
 * permanently.
 */
export default function DraftsList({ stories }: { stories: Draft[] }) {
  const [drafts, setDrafts] = useState<Draft[]>(stories)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function remove(s: Draft) {
    if (
      !confirm(
        `Delete "${s.title}" (${s.slug})?\n\nThis permanently removes the story, its charts, and any compose sources. This cannot be undone.`,
      )
    )
      return
    setError(null)
    setDeleting(s.slug)
    try {
      const res = await fetch(`/api/stories/${s.slug}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error ?? `Delete failed (HTTP ${res.status})`)
        return
      }
      setDrafts((cur) => cur.filter((d) => d.slug !== s.slug))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(null)
    }
  }

  if (drafts.length === 0) return null

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-neutral-300">Drafts · Unassigned</h2>
      <p className="text-xs text-neutral-500">
        Stories with no app yet. Assign one to publish it under that app.
      </p>
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
      <ul className="grid gap-2">
        {drafts.map((s) => (
          <li
            key={s.slug}
            className="flex items-center justify-between gap-3 overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-3"
          >
            <Link href={`/vizmaya/${s.slug}`} className="shrink-0 min-w-[8rem] max-w-[14rem] hover:underline">
              <div className="font-medium truncate">{s.title}</div>
              <div className="text-xs text-neutral-500 truncate">
                {s.slug} · {s.status}
              </div>
            </Link>
            <div className="flex items-center gap-2 shrink-0">
              <MoveStoryControl
                slug={s.slug}
                currentAppSlug={null}
                onMoved={(appSlug) => {
                  if (appSlug !== null) {
                    setDrafts((cur) => cur.filter((d) => d.slug !== s.slug))
                  }
                }}
              />
              <button
                type="button"
                onClick={() => remove(s)}
                disabled={deleting === s.slug}
                title="Delete this draft permanently"
                className="rounded-md border border-red-500/30 px-2.5 py-1.5 text-xs text-red-300 hover:border-red-400 hover:bg-red-500/10 disabled:opacity-40"
              >
                {deleting === s.slug ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
