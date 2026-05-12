'use client'

import Link from 'next/link'
import { useEffect, useState, use } from 'react'

type ThemeKey =
  | 'ink'
  | 'surface'
  | 'elevated'
  | 'bone'
  | 'muted'
  | 'line'
  | 'ember'
  | 'steel'
  | 'rose'
  | 'signal'

const KEY_LABELS: Record<ThemeKey, { label: string; hint: string }> = {
  ink: { label: 'Ink', hint: 'Page background, halos' },
  surface: { label: 'Surface', hint: 'Panels and chips' },
  elevated: { label: 'Elevated', hint: 'Hover/pressed surfaces' },
  bone: { label: 'Bone', hint: 'Primary text on dark' },
  muted: { label: 'Muted', hint: 'Secondary text, labels' },
  line: { label: 'Line', hint: 'Dividers and borders' },
  ember: { label: 'Ember', hint: 'Primary accent — airports / origin' },
  steel: { label: 'Steel', hint: 'Secondary accent — destinations' },
  rose: { label: 'Rose', hint: 'Black-book points and emails' },
  signal: { label: 'Signal', hint: 'Strong-warning highlight' },
}

interface ThemePayload {
  slug: string
  name: string
  defaults: Record<ThemeKey, string>
  theme: Partial<Record<ThemeKey, string>>
}

export default function EpicThemingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [data, setData] = useState<ThemePayload | null>(null)
  const [overrides, setOverrides] = useState<Partial<Record<ThemeKey, string>>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      const r = await fetch(`/api/admin/epics/${slug}/theme`)
      if (!r.ok) {
        setError(`load failed: ${r.status}`)
        return
      }
      const payload = (await r.json()) as ThemePayload
      setData(payload)
      setOverrides({ ...payload.theme })
    }
    load()
  }, [slug])

  function effectiveValue(key: ThemeKey): string {
    return overrides[key] ?? data?.defaults[key] ?? '#000000'
  }

  function isOverridden(key: ThemeKey): boolean {
    return overrides[key] != null && overrides[key] !== ''
  }

  function setValue(key: ThemeKey, value: string) {
    setOverrides((prev) => ({ ...prev, [key]: value }))
  }

  function reset(key: ThemeKey) {
    setOverrides((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    const r = await fetch(`/api/admin/epics/${slug}/theme`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: overrides }),
    })
    if (!r.ok) {
      const body = await r.json().catch(() => null)
      setError(body?.error ?? `HTTP ${r.status}`)
    } else {
      setSavedAt(Date.now())
    }
    setSaving(false)
  }

  if (!data && !error) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-400">
        Loading theme…
      </div>
    )
  }
  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-300">{error}</div>
    )
  }

  const keys = Object.keys(KEY_LABELS) as ThemeKey[]

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-4 py-5 border-b border-white/5 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
            <Link href="/admin" className="hover:text-white">admin</Link>
            <span>/</span>
            <span>epics</span>
            <span>/</span>
            <span className="font-mono">{slug}</span>
          </div>
          <h1 className="text-lg font-semibold">{data.name} theme</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            Override the dossier palette. Leave a row blank to fall back to the default.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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

      <div className="grid grid-cols-1 md:grid-cols-[1fr_minmax(0,360px)] gap-0 md:gap-0">
        <ul className="divide-y divide-white/5">
          {keys.map((key) => {
            const value = effectiveValue(key)
            const overridden = isOverridden(key)
            return (
              <li key={key} className="px-4 py-3 flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-md border border-white/10 shrink-0"
                  style={{ background: value }}
                  title={value}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium">{KEY_LABELS[key].label}</span>
                    <span className="text-xs text-neutral-500 font-mono">{key}</span>
                    {overridden && (
                      <span className="text-[10px] uppercase tracking-wider text-amber-300 font-mono">
                        overridden
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">{KEY_LABELS[key].hint}</p>
                </div>
                <input
                  type="color"
                  value={value}
                  onChange={(e) => setValue(key, e.target.value)}
                  className="w-9 h-9 rounded cursor-pointer bg-transparent shrink-0"
                  aria-label={`${KEY_LABELS[key].label} color picker`}
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
                  onClick={() => reset(key)}
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

        <ThemePreview
          theme={Object.fromEntries(
            keys.map((k) => [k, effectiveValue(k)])
          ) as Record<ThemeKey, string>}
        />
      </div>
    </div>
  )
}

function ThemePreview({ theme }: { theme: Record<ThemeKey, string> }) {
  const alpha = (c: string, p: number) =>
    `color-mix(in srgb, ${c} ${p}%, transparent)`
  return (
    <aside
      className="border-t md:border-t-0 md:border-l border-white/5 p-5 md:sticky md:top-[60px] md:self-start"
      style={{
        background: theme.ink,
        color: theme.bone,
      }}
    >
      <p
        className="text-[10px] uppercase tracking-[0.22em] mb-3"
        style={{ color: theme.muted }}
      >
        Preview
      </p>
      <div
        className="rounded-lg p-4 mb-3"
        style={{
          background: alpha(theme.surface, 85),
          border: `1px solid ${alpha(theme.bone, 10)}`,
        }}
      >
        <h2
          className="text-base leading-tight"
          style={{ fontFamily: 'var(--font-fraunces), serif', color: theme.bone }}
        >
          The Epstein Flight Network
        </h2>
        <p
          className="text-[11px] mt-1 font-mono uppercase tracking-[0.18em]"
          style={{ color: theme.muted }}
        >
          <span style={{ color: theme.ember }}>320</span> legs
          <span className="mx-1.5 opacity-50">·</span>
          <span style={{ color: theme.ember }}>52</span> airports
        </p>
      </div>
      <div className="flex gap-2 mb-3">
        <span
          className="px-3 py-1 rounded-full text-[10px] font-mono uppercase"
          style={{ background: theme.ember, color: theme.ink }}
        >
          flights
        </span>
        <span
          className="px-3 py-1 rounded-full text-[10px] font-mono uppercase"
          style={{ color: alpha(theme.bone, 55), border: `1px solid ${alpha(theme.bone, 10)}` }}
        >
          airports
        </span>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: theme.ember }} />
        <span className="text-[11px] font-mono uppercase" style={{ color: alpha(theme.bone, 50) }}>
          Airport
        </span>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: theme.steel }} />
        <span className="text-[11px] font-mono uppercase" style={{ color: alpha(theme.bone, 50) }}>
          Flight dest.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: theme.rose }} />
        <span className="text-[11px] font-mono uppercase" style={{ color: alpha(theme.bone, 50) }}>
          Black Book
        </span>
      </div>
    </aside>
  )
}
