'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface AuthorForm {
  slug: string
  name: string
  role: string
  bio: string
  avatarUrl: string
  profileUrl: string
  sameAs: string // one URL per line in the textarea
  status: string
}

const EMPTY: AuthorForm = {
  slug: '',
  name: '',
  role: '',
  bio: '',
  avatarUrl: '',
  profileUrl: '',
  sameAs: '',
  status: 'published',
}

const SAFE_SLUG = /^[a-z0-9-]+$/

export default function AuthorEditorClient({ slug, create }: { slug: string; create: boolean }) {
  const router = useRouter()
  const [form, setForm] = useState<AuthorForm>(EMPTY)
  const [loading, setLoading] = useState(!create)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (create) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/vizmaya/authors/${slug}`)
        if (!res.ok) throw new Error((await res.json()).error ?? 'load failed')
        const { author } = await res.json()
        if (cancelled) return
        setForm({
          slug: author.slug,
          name: author.name ?? '',
          role: author.role ?? '',
          bio: author.bio ?? '',
          avatarUrl: author.avatarUrl ?? '',
          profileUrl: author.profileUrl ?? '',
          sameAs: (author.sameAs ?? []).join('\n'),
          status: author.status ?? 'published',
        })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'load failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, create])

  function set<K extends keyof AuthorForm>(key: K, value: AuthorForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function save() {
    setError(null)
    if (create && !SAFE_SLUG.test(form.slug)) {
      setError('slug must be lowercase letters, digits, and hyphens')
      return
    }
    if (form.name.trim() === '') {
      setError('name is required')
      return
    }
    setSaving(true)
    const payload = {
      slug: form.slug,
      name: form.name,
      role: form.role,
      bio: form.bio,
      avatarUrl: form.avatarUrl,
      profileUrl: form.profileUrl,
      sameAs: form.sameAs.split('\n').map((s) => s.trim()).filter(Boolean),
      status: form.status,
    }
    try {
      const res = create
        ? await fetch('/api/vizmaya/authors', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/vizmaya/authors/${slug}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
      if (!res.ok) throw new Error((await res.json()).error ?? 'save failed')
      router.push('/vizmaya/authors')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed')
      setSaving(false)
    }
  }

  async function remove() {
    if (create) return
    if (!confirm(`Delete author "${form.name}"? This cannot be undone.`)) return
    setSaving(true)
    try {
      const res = await fetch(`/api/vizmaya/authors/${slug}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'delete failed')
      router.push('/vizmaya/authors')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'delete failed')
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">Loading…</div>
  }

  const field = 'w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30'
  const label = 'block text-xs uppercase tracking-wider text-neutral-500 mb-1.5'

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Link href="/vizmaya/authors" className="text-sm text-neutral-400 hover:text-white">
          ← Authors
        </Link>
        <h1 className="text-lg font-semibold mt-3 mb-6">{create ? 'New author' : form.name || slug}</h1>

        {error && (
          <div className="mb-4 text-sm text-red-400 border border-red-500/30 bg-red-500/5 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="grid gap-5">
          <div>
            <label className={label}>Slug</label>
            <input
              className={field}
              value={form.slug}
              disabled={!create}
              placeholder="jane-doe"
              onChange={(e) => set('slug', e.target.value)}
            />
            {!create && <p className="text-xs text-neutral-600 mt-1">Slug is immutable.</p>}
          </div>
          <div>
            <label className={label}>Name</label>
            <input className={field} value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div>
            <label className={label}>Role</label>
            <input
              className={field}
              value={form.role}
              placeholder="Senior data journalist"
              onChange={(e) => set('role', e.target.value)}
            />
          </div>
          <div>
            <label className={label}>Bio / credentials</label>
            <textarea className={`${field} min-h-[120px]`} value={form.bio} onChange={(e) => set('bio', e.target.value)} />
          </div>
          <div>
            <label className={label}>Avatar URL</label>
            <input className={field} value={form.avatarUrl} onChange={(e) => set('avatarUrl', e.target.value)} />
          </div>
          <div>
            <label className={label}>Profile URL (canonical)</label>
            <input
              className={field}
              value={form.profileUrl}
              placeholder="/authors/jane-doe"
              onChange={(e) => set('profileUrl', e.target.value)}
            />
            <p className="text-xs text-neutral-600 mt-1">Leave blank to default to /authors/&lt;slug&gt;.</p>
          </div>
          <div>
            <label className={label}>Social links (sameAs — one URL per line)</label>
            <textarea
              className={`${field} min-h-[90px] font-mono text-xs`}
              value={form.sameAs}
              placeholder={'https://twitter.com/...\nhttps://linkedin.com/in/...'}
              onChange={(e) => set('sameAs', e.target.value)}
            />
          </div>
          <div>
            <label className={label}>Status</label>
            <select className={field} value={form.status} onChange={(e) => set('status', e.target.value)}>
              <option value="published">published</option>
              <option value="draft">draft</option>
              <option value="archived">archived</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-8">
          <button
            onClick={save}
            disabled={saving}
            className="text-sm bg-white text-black px-4 py-2 rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : create ? 'Create author' : 'Save changes'}
          </button>
          {!create && (
            <button
              onClick={remove}
              disabled={saving}
              className="text-sm text-red-400 hover:text-red-300 px-3 py-2 disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
