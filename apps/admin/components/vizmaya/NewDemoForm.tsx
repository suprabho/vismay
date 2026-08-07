'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminPanel } from '@/components/admin'

interface StoryOption {
  slug: string
  title: string
}

export default function NewDemoForm() {
  const router = useRouter()
  const { setDirty } = useAdminPanel()
  const [clientName, setClientName] = useState('')
  const [clientSlug, setClientSlug] = useState('')
  const [storySlug, setStorySlug] = useState('')
  const [password, setPassword] = useState('')
  const [stories, setStories] = useState<StoryOption[]>([])
  const [storiesLoaded, setStoriesLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const dirty = clientName !== '' || clientSlug !== '' || storySlug !== '' || password !== ''
  useEffect(() => setDirty(dirty), [dirty, setDirty])

  useEffect(() => {
    let alive = true
    fetch('/api/stories')
      .then((response) => response.json())
      .then((data: { slug: string; title: string }[]) => {
        if (alive) setStories(data.map((story) => ({ slug: story.slug, title: story.title })))
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setStoriesLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [])

  function autoSlug(name: string) {
    setClientName(name)
    if (!clientSlug || clientSlug === slugify(clientName)) setClientSlug(slugify(name))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    start(async () => {
      const response = await fetch('/api/vizmaya/demos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_slug: clientSlug,
          client_name: clientName,
          story_slug: storySlug,
          password,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(body.error ?? `HTTP ${response.status}`)
        return
      }
      setDirty(false)
      router.push('/vizmaya/demos')
      router.refresh()
    })
  }

  const field = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-white/30 focus:outline-none'

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="border-b border-white/10 px-6 py-4">
        <h1 className="text-lg font-semibold">New demo</h1>
        <p className="mt-1 text-sm text-neutral-400">Create a password-protected demo for a prospect.</p>
      </div>
      <div className="grid max-w-xl gap-5 p-6">
        <Field label="Client name">
          <input value={clientName} onChange={(event) => autoSlug(event.target.value)} required placeholder="Hindustan Times" autoFocus className={field} />
        </Field>
        <Field label="URL slug" hint="lowercase letters, numbers, dashes">
          <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-3">
            <span className="text-sm text-neutral-500">/demo/</span>
            <input value={clientSlug} onChange={(event) => setClientSlug(event.target.value)} required pattern="[a-z0-9][a-z0-9_-]{1,63}" className="flex-1 bg-transparent py-2 text-sm outline-none" />
          </div>
        </Field>
        <Field label="Story">
          <select value={storySlug} onChange={(event) => setStorySlug(event.target.value)} required className={field}>
            <option value="">{storiesLoaded ? 'Pick a story…' : 'Loading…'}</option>
            {stories.map((story) => <option key={story.slug} value={story.slug}>{story.title} ({story.slug})</option>)}
          </select>
        </Field>
        <Field label="Password" hint="6+ characters; share with the prospect">
          <input type="text" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} className={`${field} font-mono`} />
        </Field>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </div>
      <div className="mt-auto flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
        <button type="button" onClick={() => router.back()} className="px-4 py-2 text-sm text-neutral-300 hover:text-white">Cancel</button>
        <button type="submit" disabled={pending} className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-950 disabled:opacity-50">{pending ? 'Creating…' : 'Create'}</button>
      </div>
    </form>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        {hint ? <span className="text-xs text-neutral-500">{hint}</span> : null}
      </div>
      {children}
    </label>
  )
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
}
