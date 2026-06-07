'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { DemoListItem } from '@vismay/content-source/demos'
import { vizmayaUrl } from '@/lib/publicSite'

interface Props {
  initialDemos: DemoListItem[]
}

interface StoryOption {
  slug: string
  title: string
}

export default function DemosListClient({ initialDemos }: Props) {
  const router = useRouter()
  const [demos, setDemos] = useState(initialDemos)
  const [showNew, setShowNew] = useState(false)
  const [stories, setStories] = useState<StoryOption[]>([])
  const [storiesLoaded, setStoriesLoaded] = useState(false)

  useEffect(() => {
    if (!showNew || storiesLoaded) return
    fetch('/api/stories')
      .then((r) => r.json())
      .then((data: { slug: string; title: string }[]) => {
        setStories(data.map((s) => ({ slug: s.slug, title: s.title })))
        setStoriesLoaded(true)
      })
      .catch(() => setStoriesLoaded(true))
  }, [showNew, storiesLoaded])

  const sorted = useMemo(
    () => [...demos].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [demos]
  )

  async function handleCreated(demo: DemoListItem) {
    setDemos((prev) => [demo, ...prev])
    setShowNew(false)
    router.push(`/vizmaya/demos/${demo.id}`)
  }

  async function handleDelete(id: number, clientName: string) {
    if (!confirm(`Delete demo "${clientName}"? This cannot be undone.`)) return
    const res = await fetch(`/api/vizmaya/demos/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setDemos((prev) => prev.filter((d) => d.id !== id))
    } else {
      alert('Delete failed')
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Demos</h1>
        <button
          onClick={() => setShowNew(true)}
          className="bg-white text-neutral-950 rounded-md px-4 py-2 text-sm font-medium"
        >
          New demo
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {sorted.length === 0 ? (
          <div className="text-neutral-400 text-sm">
            No demos yet. Create one to share a story with a prospect.
          </div>
        ) : (
          <div className="grid gap-3 max-w-4xl">
            {sorted.map((d) => (
              <div
                key={d.id}
                className="border border-white/10 rounded-lg p-4 flex items-center justify-between gap-4 hover:border-white/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Link
                      href={`/vizmaya/demos/${d.id}`}
                      className="font-medium hover:underline"
                    >
                      {d.client_name}
                    </Link>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="text-xs text-neutral-400 flex items-center gap-3">
                    <code className="text-neutral-500">/demo/{d.client_slug}</code>
                    <span>·</span>
                    <span>story: {d.story_slug}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={vizmayaUrl(`/demo/${d.client_slug}`)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-neutral-300 hover:text-white px-2 py-1"
                  >
                    Open ↗
                  </Link>
                  <Link
                    href={`/vizmaya/demos/${d.id}`}
                    className="text-xs bg-white/10 hover:bg-white/20 rounded-md px-3 py-1.5"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete(d.id, d.client_name)}
                    className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <NewDemoModal
          stories={stories}
          storiesLoaded={storiesLoaded}
          onClose={() => setShowNew(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-neutral-700 text-neutral-300',
    live: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    archived: 'bg-neutral-800 text-neutral-500',
  }
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${styles[status] ?? styles.draft}`}>
      {status}
    </span>
  )
}

interface NewDemoModalProps {
  stories: StoryOption[]
  storiesLoaded: boolean
  onClose: () => void
  onCreated: (demo: DemoListItem) => void
}

function NewDemoModal({ stories, storiesLoaded, onClose, onCreated }: NewDemoModalProps) {
  const [clientName, setClientName] = useState('')
  const [clientSlug, setClientSlug] = useState('')
  const [storySlug, setStorySlug] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function autoSlug(name: string) {
    setClientName(name)
    if (!clientSlug || clientSlug === slugify(clientName)) {
      setClientSlug(slugify(name))
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await fetch('/api/vizmaya/demos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_slug: clientSlug,
          client_name: clientName,
          story_slug: storySlug,
          password,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { demo?: DemoListItem; error?: string }
      if (!res.ok) {
        setError(body.error ?? `HTTP ${res.status}`)
        return
      }
      if (body.demo) onCreated(body.demo)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-900 border border-white/10 rounded-xl p-6 w-full max-w-md space-y-4"
      >
        <h2 className="text-lg font-semibold">New demo</h2>

        <Field label="Client name">
          <input
            value={clientName}
            onChange={(e) => autoSlug(e.target.value)}
            required
            placeholder="Hindustan Times"
            autoFocus
            className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2"
          />
        </Field>

        <Field label="URL slug" hint="lowercase letters, numbers, dashes">
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-md px-3">
            <span className="text-neutral-500 text-sm">/demo/</span>
            <input
              value={clientSlug}
              onChange={(e) => setClientSlug(e.target.value)}
              required
              pattern="[a-z0-9][a-z0-9_-]{1,63}"
              className="flex-1 bg-transparent py-2 outline-none"
            />
          </div>
        </Field>

        <Field label="Story">
          <select
            value={storySlug}
            onChange={(e) => setStorySlug(e.target.value)}
            required
            className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2"
          >
            <option value="">{storiesLoaded ? 'Pick a story…' : 'Loading…'}</option>
            {stories.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.title} ({s.slug})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Password" hint="6+ characters; share with the prospect">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 font-mono"
          />
        </Field>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-300 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="bg-white text-neutral-950 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {pending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-neutral-500">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}
