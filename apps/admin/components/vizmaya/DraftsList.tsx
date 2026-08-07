'use client'

import Link from 'next/link'
import { useState } from 'react'
import MoveStoryControl from './MoveStoryControl'
import { AdminTable } from '@/components/admin'

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
      <AdminTable
        rows={drafts}
        rowKey={(story) => story.slug}
        caption="Unassigned drafts"
        empty="No unassigned drafts."
        columns={[
          {
            key: 'story',
            label: 'Story',
            render: (story) => (
              <Link href={`/vizmaya/${story.slug}`} className="block min-w-0 hover:text-white">
                <div className="truncate font-medium">{story.title}</div>
                <div className="mt-0.5 truncate text-xs text-neutral-500">{story.slug}</div>
              </Link>
            ),
          },
          {
            key: 'status',
            label: 'Status',
            responsive: 'secondary',
            className: 'w-28 text-neutral-400',
            render: (story) => story.status,
          },
          {
            key: 'actions',
            label: 'Actions',
            sticky: true,
            className: 'w-52 text-right',
            render: (story) => (
              <div className="flex items-center justify-end gap-2">
                <MoveStoryControl
                  slug={story.slug}
                  currentAppSlug={null}
                  onMoved={(appSlug) => {
                    if (appSlug !== null) setDrafts((cur) => cur.filter((d) => d.slug !== story.slug))
                  }}
                />
                <button
                  type="button"
                  onClick={() => remove(story)}
                  disabled={deleting === story.slug}
                  title="Delete this draft permanently"
                  className="rounded-md border border-red-500/30 px-2.5 py-1.5 text-xs text-red-300 hover:border-red-400 hover:bg-red-500/10 disabled:opacity-40"
                >
                  {deleting === story.slug ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
