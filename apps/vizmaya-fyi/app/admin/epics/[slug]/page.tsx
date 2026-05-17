'use client'

import Link from 'next/link'
import { useEffect, useState, use } from 'react'
import { THEME_REGISTRY } from '../themeRegistry'

interface ThemePayload {
  slug: string
  name: string
  defaults: Record<string, string>
  labels: Record<string, { label: string; hint: string }>
  theme: Record<string, string>
}

interface StoriesPayload {
  slug: string
  name: string
  appSlug: string
  stories: {
    slug: string
    title: string
    status: string
    inEpic: boolean
    position: number | null
  }[]
}

interface AppOption {
  slug: string
  name: string
}

interface MembershipEdit {
  inEpic: boolean
  position: number | null
}

export default function EpicAdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [data, setData] = useState<ThemePayload | null>(null)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [stories, setStories] = useState<StoriesPayload['stories'] | null>(null)
  const [epicName, setEpicName] = useState<string>(slug)
  const [memberships, setMemberships] = useState<Record<string, MembershipEdit>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [tab, setTab] = useState<'stories' | 'theme'>('stories')
  const [apps, setApps] = useState<AppOption[]>([])
  const [appSlug, setAppSlug] = useState<string>('')
  const [savingApp, setSavingApp] = useState(false)

  useEffect(() => {
    async function load() {
      const [themeR, storiesR] = await Promise.all([
        fetch(`/api/admin/epics/${slug}/theme`),
        fetch(`/api/admin/epics/${slug}/stories`),
      ])
      if (themeR.ok) {
        const payload = (await themeR.json()) as ThemePayload
        setData(payload)
        setOverrides({ ...payload.theme })
      } else if (themeR.status !== 404) {
        setError(`theme load failed: ${themeR.status}`)
        return
      }
      if (!storiesR.ok) {
        setError(`stories load failed: ${storiesR.status}`)
        return
      }
      const sPayload = (await storiesR.json()) as StoriesPayload
      setStories(sPayload.stories)
      setEpicName(sPayload.name)
      setAppSlug(sPayload.appSlug)
      setMemberships(
        Object.fromEntries(
          sPayload.stories.map((s) => [s.slug, { inEpic: s.inEpic, position: s.position }]),
        ),
      )
    }
    load()
  }, [slug])

  useEffect(() => {
    async function loadApps() {
      const r = await fetch('/api/admin/apps')
      if (!r.ok) return
      const data = (await r.json()) as Array<{ slug: string; name: string }>
      setApps(data.map((a) => ({ slug: a.slug, name: a.name })))
    }
    loadApps()
  }, [])

  async function changeApp(nextApp: string) {
    if (nextApp === appSlug) return
    setSavingApp(true)
    setError(null)
    const res = await fetch(`/api/admin/epics/${slug}/app`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appSlug: nextApp }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setError(body?.error ?? `HTTP ${res.status}`)
    } else {
      setAppSlug(nextApp)
      setSavedAt(Date.now())
    }
    setSavingApp(false)
  }

  function effectiveValue(key: string): string {
    return overrides[key] ?? data?.defaults[key] ?? '#000000'
  }
  function isOverridden(key: string): boolean {
    return overrides[key] != null && overrides[key] !== ''
  }
  function setValue(key: string, value: string) {
    setOverrides((prev) => ({ ...prev, [key]: value }))
  }
  function resetKey(key: string) {
    setOverrides((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function toggleMember(storySlug: string) {
    setMemberships((prev) => {
      const cur = prev[storySlug] ?? { inEpic: false, position: null }
      const nextIn = !cur.inEpic
      // When adding, default the position to the next available integer.
      let nextPos = cur.position
      if (nextIn && nextPos == null) {
        const used = Object.values(prev)
          .filter((m) => m.inEpic && typeof m.position === 'number')
          .map((m) => m.position as number)
        nextPos = used.length === 0 ? 1 : Math.max(...used) + 1
      }
      return { ...prev, [storySlug]: { inEpic: nextIn, position: nextIn ? nextPos : null } }
    })
  }

  function setPosition(storySlug: string, raw: string) {
    setMemberships((prev) => {
      const cur = prev[storySlug] ?? { inEpic: false, position: null }
      if (raw.trim() === '') return { ...prev, [storySlug]: { ...cur, position: null } }
      const n = Number.parseInt(raw, 10)
      if (Number.isNaN(n)) return prev
      return { ...prev, [storySlug]: { ...cur, position: n } }
    })
  }

  async function save() {
    setSaving(true)
    setError(null)

    const calls: Promise<Response>[] = []
    if (data) {
      calls.push(
        fetch(`/api/admin/epics/${slug}/theme`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ theme: overrides }),
        }),
      )
    }
    const targetMemberships = Object.entries(memberships)
      .filter(([, m]) => m.inEpic)
      .map(([storySlug, m]) => ({ storySlug, position: m.position }))
    calls.push(
      fetch(`/api/admin/epics/${slug}/stories`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ memberships: targetMemberships }),
      }),
    )

    const results = await Promise.all(calls)
    const failed = results.find((r) => !r.ok)
    if (failed) {
      const body = await failed.json().catch(() => null)
      setError(body?.error ?? `HTTP ${failed.status}`)
    } else {
      setSavedAt(Date.now())
      // Refresh stories so positions reflect any normalisation server-side.
      const r = await fetch(`/api/admin/epics/${slug}/stories`)
      if (r.ok) {
        const sPayload = (await r.json()) as StoriesPayload
        setStories(sPayload.stories)
        setMemberships(
          Object.fromEntries(
            sPayload.stories.map((s) => [s.slug, { inEpic: s.inEpic, position: s.position }]),
          ),
        )
      }
    }
    setSaving(false)
  }

  if (!data && !stories && !error) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-400">Loading…</div>
    )
  }
  if (error && !stories) {
    return <div className="flex-1 flex items-center justify-center text-red-300">{error}</div>
  }

  const themeEntry = data ? THEME_REGISTRY[slug] : null
  const themeKeys = themeEntry ? Object.keys(themeEntry.defaults) : []
  const Preview = themeEntry?.Preview

  // Sort stories: members (by current edited position) first, then others alphabetically.
  const sortedStories = stories
    ? [...stories].sort((a, b) => {
        const am = memberships[a.slug]?.inEpic ?? false
        const bm = memberships[b.slug]?.inEpic ?? false
        if (am !== bm) return am ? -1 : 1
        if (am) {
          const ap = memberships[a.slug]?.position ?? Number.POSITIVE_INFINITY
          const bp = memberships[b.slug]?.position ?? Number.POSITIVE_INFINITY
          if (ap !== bp) return ap - bp
        }
        return a.title.localeCompare(b.title)
      })
    : []

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-4 py-5 border-b border-white/5 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
            <Link href="/admin/epics" className="hover:text-white">epics</Link>
            <span>/</span>
            <span className="font-mono">{slug}</span>
          </div>
          <h1 className="text-lg font-semibold">{epicName}</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            Manage stories in this epic{themeEntry ? ' and tune its palette' : ''}.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="flex items-center gap-1.5 text-xs text-neutral-500">
            <span className="uppercase tracking-wider">App</span>
            <select
              value={appSlug}
              onChange={(e) => changeApp(e.target.value)}
              disabled={savingApp || apps.length === 0}
              className="text-sm bg-neutral-900 border border-white/10 rounded-lg px-2 py-1.5 text-neutral-100 cursor-pointer disabled:opacity-50"
            >
              {apps.length === 0 && appSlug && <option value={appSlug}>{appSlug}</option>}
              {apps.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <Link
            href={`/${slug}`}
            target="_blank"
            className="text-sm text-neutral-300 hover:text-white px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/5"
          >
            view page →
          </Link>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="text-sm px-3 py-1.5 rounded-lg bg-white text-black hover:bg-neutral-200 disabled:opacity-50"
          >
            {saving ? 'saving…' : 'save'}
          </button>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-white/5 flex gap-1">
        <button
          type="button"
          onClick={() => setTab('stories')}
          className={
            'text-sm px-3 py-1 rounded-md ' +
            (tab === 'stories'
              ? 'bg-white/10 text-white'
              : 'text-neutral-400 hover:text-white hover:bg-white/5')
          }
          aria-pressed={tab === 'stories'}
        >
          Stories
        </button>
        <button
          type="button"
          onClick={() => setTab('theme')}
          disabled={!themeEntry}
          title={themeEntry ? undefined : 'No theme registered for this epic'}
          className={
            'text-sm px-3 py-1 rounded-md disabled:opacity-30 disabled:cursor-not-allowed ' +
            (tab === 'theme'
              ? 'bg-white/10 text-white'
              : 'text-neutral-400 hover:text-white hover:bg-white/5')
          }
          aria-pressed={tab === 'theme'}
        >
          Theme
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs border-b border-white/5 bg-red-950/20 text-red-300">
          {error}
        </div>
      )}
      {savedAt && !error && (
        <div className="px-4 py-2 text-xs border-b border-white/5 bg-emerald-950/20 text-emerald-300">
          saved · refresh the page in a new tab to see changes
        </div>
      )}

      {tab === 'stories' && stories && (
        <section>
          <div className="px-4 py-3 border-b border-white/5 flex items-baseline justify-between">
            <h2 className="font-medium">Stories</h2>
            <span className="text-xs text-neutral-500">
              {Object.values(memberships).filter((m) => m.inEpic).length} of {stories.length} in epic
            </span>
          </div>
          <ul className="divide-y divide-white/5">
            {sortedStories.map((s) => {
              const m = memberships[s.slug] ?? { inEpic: false, position: null }
              return (
                <li key={s.slug} className="px-4 py-3 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={m.inEpic}
                    onChange={() => toggleMember(s.slug)}
                    className="w-4 h-4 shrink-0 accent-white"
                    aria-label={`include ${s.title} in epic`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium truncate">{s.title}</span>
                      <span className="text-xs text-neutral-500 font-mono truncate">{s.slug}</span>
                      {s.status !== 'published' && (
                        <span className="text-[10px] uppercase tracking-wider text-amber-300 font-mono shrink-0">
                          {s.status}
                        </span>
                      )}
                    </div>
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={m.position == null ? '' : String(m.position)}
                    onChange={(e) => setPosition(s.slug, e.target.value)}
                    disabled={!m.inEpic}
                    placeholder="pos"
                    className="w-16 text-sm font-mono bg-neutral-900 border border-white/10 rounded px-2 py-1 text-white placeholder:text-neutral-600 shrink-0 disabled:opacity-30"
                    aria-label={`position of ${s.title}`}
                  />
                </li>
              )
            })}
            {sortedStories.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-neutral-500">
                No stories in the database yet.
              </li>
            )}
          </ul>
        </section>
      )}

      {tab === 'theme' && data && themeEntry && Preview && (
        <section>
          <div className="px-4 py-3 border-b border-white/5">
            <h2 className="font-medium">Theme</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Override the palette. Leave a row blank to fall back to the default.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_minmax(0,360px)] gap-0">
            <ul className="divide-y divide-white/5">
              {themeKeys.map((key) => {
                const value = effectiveValue(key)
                const overridden = isOverridden(key)
                const meta = themeEntry.labels[key]
                return (
                  <li key={key} className="px-4 py-3 flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-md border border-white/10 shrink-0"
                      style={{ background: value }}
                      title={value}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium">{meta.label}</span>
                        <span className="text-xs text-neutral-500 font-mono">{key}</span>
                        {overridden && (
                          <span className="text-[10px] uppercase tracking-wider text-amber-300 font-mono">
                            overridden
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-500 mt-0.5">{meta.hint}</p>
                    </div>
                    <input
                      type="color"
                      value={value}
                      onChange={(e) => setValue(key, e.target.value)}
                      className="w-9 h-9 rounded cursor-pointer bg-transparent shrink-0"
                      aria-label={`${meta.label} color picker`}
                    />
                    <input
                      type="text"
                      value={overrides[key] ?? ''}
                      onChange={(e) => setValue(key, e.target.value)}
                      placeholder={data.defaults[key]}
                      className="w-24 text-sm font-mono bg-neutral-900 border border-white/10 rounded px-2 py-1 text-white placeholder:text-neutral-600 shrink-0"
                    />
                    <button
                      type="button"
                      onClick={() => resetKey(key)}
                      disabled={!overridden}
                      className="text-xs text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400 shrink-0 px-2"
                      title="Reset to default"
                    >
                      reset
                    </button>
                  </li>
                )
              })}
            </ul>

            <Preview theme={Object.fromEntries(themeKeys.map((k) => [k, effectiveValue(k)]))} />
          </div>
        </section>
      )}

      {tab === 'theme' && data && !themeEntry && (
        <section className="px-4 py-6 text-sm text-neutral-500">
          No theme registered for &ldquo;{slug}&rdquo;.
        </section>
      )}
    </div>
  )
}
