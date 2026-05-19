'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, use } from 'react'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import { THEME_REGISTRY } from '../themeRegistry'

type FontKey = 'serif' | 'sans' | 'mono'
const FONT_KEYS: readonly FontKey[] = ['serif', 'sans', 'mono'] as const
type FontStatus = 'loading' | 'loaded' | 'error'

const FONT_PRESETS: Record<FontKey, string[]> = {
  serif: ['Merriweather', 'Instrument Serif', 'Playfair Display', 'Fraunces', 'Lora', 'EB Garamond'],
  sans: ['Inter', 'Geist', 'IBM Plex Sans', 'Work Sans', 'Manrope'],
  mono: ['JetBrains Mono', 'IBM Plex Mono', 'Fira Code', 'Geist Mono'],
}

interface ThemePayload {
  slug: string
  name: string
  defaults: Record<string, string>
  labels: Record<string, { label: string; hint: string }>
  fontDefaults: Record<FontKey, string>
  mapStyleDefault: string
  // Persisted overrides. Colors are flat hex strings; `fonts` and `mapStyle`
  // are nested non-color keys, hence the `unknown` value type.
  theme: Record<string, unknown>
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

// Pull color/font/map overrides out of the persisted JSON. Colors are flat
// hex strings; `fonts` is a nested object; `mapStyle` is a string. Anything
// shaped unexpectedly is ignored rather than blowing up the editor.
function splitPersisted(theme: Record<string, unknown>): {
  colors: Record<string, string>
  fonts: Partial<Record<FontKey, string>>
  mapStyle: string
} {
  const colors: Record<string, string> = {}
  const fonts: Partial<Record<FontKey, string>> = {}
  let mapStyle = ''
  for (const [key, value] of Object.entries(theme)) {
    if (key === 'fonts' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const fk of FONT_KEYS) {
        const fv = (value as Record<string, unknown>)[fk]
        if (typeof fv === 'string' && fv) fonts[fk] = fv
      }
      continue
    }
    if (key === 'mapStyle') {
      if (typeof value === 'string') mapStyle = value
      continue
    }
    if (typeof value === 'string' && value) colors[key] = value
  }
  return { colors, fonts, mapStyle }
}

export default function EpicAdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [data, setData] = useState<ThemePayload | null>(null)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [fontOverrides, setFontOverrides] = useState<Partial<Record<FontKey, string>>>({})
  const [mapStyleOverride, setMapStyleOverride] = useState<string>('')
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
        fetch(`/api/vizmaya/epics/${slug}/theme`),
        fetch(`/api/vizmaya/epics/${slug}/stories`),
      ])
      if (themeR.ok) {
        const payload = (await themeR.json()) as ThemePayload
        setData(payload)
        const split = splitPersisted(payload.theme ?? {})
        setOverrides(split.colors)
        setFontOverrides(split.fonts)
        setMapStyleOverride(split.mapStyle)
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
      const r = await fetch('/api/vizmaya/apps')
      if (!r.ok) return
      const data = (await r.json()) as Array<{ slug: string; name: string }>
      setApps(data.map((a) => ({ slug: a.slug, name: a.name })))
    }
    loadApps()
  }, [])

  const effectiveFonts = useMemo<Record<FontKey, string>>(
    () => ({
      serif: fontOverrides.serif ?? data?.fontDefaults.serif ?? '',
      sans: fontOverrides.sans ?? data?.fontDefaults.sans ?? '',
      mono: fontOverrides.mono ?? data?.fontDefaults.mono ?? '',
    }),
    [fontOverrides, data?.fontDefaults],
  )

  // Inject Google Fonts so the FontField previews can actually render the
  // chosen face. Same pattern as ThemeEditor.tsx.
  useEffect(() => {
    const url = getFontImportUrl(effectiveFonts)
    const existing = document.getElementById('admin-epic-theme-fonts')
    if (existing) existing.remove()
    if (!url) return
    const link = document.createElement('link')
    link.id = 'admin-epic-theme-fonts'
    link.rel = 'stylesheet'
    link.href = url
    document.head.appendChild(link)
    return () => {
      link.remove()
    }
  }, [effectiveFonts])

  const [fontStatus, setFontStatus] = useState<Record<FontKey, FontStatus>>({
    serif: 'loading',
    sans: 'loading',
    mono: 'loading',
  })
  useEffect(() => {
    let cancelled = false
    FONT_KEYS.forEach(async (k) => {
      const name = effectiveFonts[k]
      if (!name) {
        if (!cancelled) setFontStatus((s) => ({ ...s, [k]: 'error' }))
        return
      }
      try {
        if (document.fonts.check(`16px "${name}"`)) {
          if (!cancelled) setFontStatus((s) => ({ ...s, [k]: 'loaded' }))
          return
        }
        await document.fonts.load(`16px "${name}"`)
        if (!cancelled)
          setFontStatus((s) => ({
            ...s,
            [k]: document.fonts.check(`16px "${name}"`) ? 'loaded' : 'error',
          }))
      } catch {
        if (!cancelled) setFontStatus((s) => ({ ...s, [k]: 'error' }))
      }
    })
    return () => {
      cancelled = true
    }
  }, [effectiveFonts])

  async function changeApp(nextApp: string) {
    if (nextApp === appSlug) return
    setSavingApp(true)
    setError(null)
    const res = await fetch(`/api/vizmaya/epics/${slug}/app`, {
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
  function effectiveFont(key: FontKey): string {
    return fontOverrides[key] ?? data?.fontDefaults[key] ?? ''
  }
  function setFont(key: FontKey, value: string) {
    setFontOverrides((prev) => ({ ...prev, [key]: value }))
  }
  function resetFont(key: FontKey) {
    setFontOverrides((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }
  const effectiveMapStyle = mapStyleOverride || data?.mapStyleDefault || ''
  const mapStyleOverridden = mapStyleOverride !== ''

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
      // Merge color overrides with the nested fonts/mapStyle overrides into
      // one theme payload — the API splits them apart on validation.
      const themeBody: Record<string, unknown> = { ...overrides }
      if (Object.keys(fontOverrides).length > 0) themeBody.fonts = fontOverrides
      if (mapStyleOverride) themeBody.mapStyle = mapStyleOverride
      calls.push(
        fetch(`/api/vizmaya/epics/${slug}/theme`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ theme: themeBody }),
        }),
      )
    }
    const targetMemberships = Object.entries(memberships)
      .filter(([, m]) => m.inEpic)
      .map(([storySlug, m]) => ({ storySlug, position: m.position }))
    calls.push(
      fetch(`/api/vizmaya/epics/${slug}/stories`, {
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
      const r = await fetch(`/api/vizmaya/epics/${slug}/stories`)
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
            <Link href="/vizmaya/epics" className="hover:text-white">epics</Link>
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
            href={`https://vizmaya.fyi/epic/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-neutral-300 hover:text-white px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/5"
          >
            preview →
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
        <section className="flex-1 overflow-y-auto min-h-0">
          <div className="mx-auto max-w-5xl p-4 space-y-8">
            <div>
              <h2 className="font-medium">Theme</h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Override the palette, fonts, and base map. Leave a field blank or hit
                {' '}reset to fall back to the default.
              </p>
            </div>

            <Preview theme={Object.fromEntries(themeKeys.map((k) => [k, effectiveValue(k)]))} />

            <ThemeSection title="Colors">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {themeKeys.map((key) => {
                  const value = effectiveValue(key)
                  const meta = themeEntry.labels[key]
                  return (
                    <ColorTile
                      key={key}
                      tokenKey={key}
                      label={meta.label}
                      hint={meta.hint}
                      value={value}
                      rawOverride={overrides[key] ?? ''}
                      placeholder={data.defaults[key]}
                      overridden={isOverridden(key)}
                      onChange={(v) => setValue(key, v)}
                      onReset={() => resetKey(key)}
                    />
                  )
                })}
              </div>
            </ThemeSection>

            <ThemeSection title="Fonts">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {FONT_KEYS.map((k) => (
                  <FontTile
                    key={k}
                    family={k}
                    value={effectiveFont(k)}
                    presets={FONT_PRESETS[k]}
                    status={fontStatus[k]}
                    overridden={fontOverrides[k] != null}
                    onChange={(v) => setFont(k, v)}
                    onReset={() => resetFont(k)}
                  />
                ))}
              </div>
              <p className="text-xs text-neutral-500 mt-2">
                Free-text font names. Anything on Google Fonts (or already loaded on the page)
                renders; others fall back.
              </p>
            </ThemeSection>

            <ThemeSection title="Map">
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">Mapbox style URL</div>
                    <div className="text-[11px] text-neutral-500 truncate">
                      Base map style for this epic
                    </div>
                  </div>
                  {mapStyleOverridden && (
                    <span className="text-[10px] uppercase tracking-wider text-amber-300 font-mono shrink-0">
                      overridden
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={mapStyleOverride}
                    onChange={(e) => setMapStyleOverride(e.target.value)}
                    placeholder={data.mapStyleDefault}
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="flex-1 min-w-0 bg-black/30 rounded px-2 py-1.5 font-mono text-[13px] border border-white/10 focus:outline-none focus:border-white/30"
                  />
                  <button
                    type="button"
                    onClick={() => setMapStyleOverride('')}
                    disabled={!mapStyleOverridden}
                    className="text-xs text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400 px-2"
                    title="Reset to default"
                  >
                    reset
                  </button>
                </div>
                <div className="text-[11px] font-mono text-neutral-500 truncate">
                  effective: {effectiveMapStyle || '(none)'}
                </div>
              </div>
            </ThemeSection>
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

function ThemeSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs uppercase tracking-[0.18em] text-neutral-400">{title}</h3>
      {children}
    </section>
  )
}

function ColorTile({
  tokenKey,
  label,
  hint,
  value,
  rawOverride,
  placeholder,
  overridden,
  onChange,
  onReset,
}: {
  tokenKey: string
  label: string
  hint: string
  value: string
  rawOverride: string
  placeholder: string
  overridden: boolean
  onChange: (v: string) => void
  onReset: () => void
}) {
  return (
    <label className="block bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-medium truncate">{label}</span>
            <span className="text-[10px] font-mono text-neutral-500 truncate">{tokenKey}</span>
          </div>
          <div className="text-[11px] text-neutral-500 truncate">{hint}</div>
        </div>
        {overridden && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              onReset()
            }}
            className="text-[11px] text-neutral-500 hover:text-white px-2 py-0.5 rounded border border-white/10 shrink-0"
            title="Reset to default"
          >
            reset
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 rounded cursor-pointer bg-transparent border border-white/10"
          style={{ padding: 0 }}
          aria-label={`${label} color`}
        />
        <input
          type="text"
          value={rawOverride}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          className="flex-1 min-w-0 bg-black/30 rounded px-2 py-1.5 font-mono text-[13px] border border-white/10 focus:outline-none focus:border-white/30"
        />
      </div>
    </label>
  )
}

function FontTile({
  family,
  value,
  presets,
  status,
  overridden,
  onChange,
  onReset,
}: {
  family: FontKey
  value: string
  presets: string[]
  status: FontStatus
  overridden: boolean
  onChange: (v: string) => void
  onReset: () => void
}) {
  return (
    <label className="block bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium capitalize shrink-0">{family}</span>
          {status === 'error' && (
            <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 rounded px-1.5 py-0.5 shrink-0">
              not loaded
            </span>
          )}
          {status === 'loading' && (
            <span className="text-[10px] text-neutral-500 shrink-0">…</span>
          )}
          {overridden && (
            <span className="text-[10px] uppercase tracking-wider text-amber-300 font-mono shrink-0">
              overridden
            </span>
          )}
        </div>
        <span
          className="text-[11px] text-neutral-400 truncate max-w-[40%]"
          style={{ fontFamily: `"${value}", ${family}` }}
        >
          AaBb 123
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          list={`epic-font-${family}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          className="flex-1 min-w-0 bg-black/30 rounded px-2 py-1.5 text-sm border border-white/10 focus:outline-none focus:border-white/30"
        />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            onReset()
          }}
          disabled={!overridden}
          className="text-xs text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400 px-2"
          title="Reset to default"
        >
          reset
        </button>
      </div>
      <datalist id={`epic-font-${family}`}>
        {presets.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </label>
  )
}
