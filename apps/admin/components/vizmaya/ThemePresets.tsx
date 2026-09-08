'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, FloppyDisk, Star, Trash, X } from '@phosphor-icons/react'
import type { Theme } from '@vismay/viz-engine'
import { builtinThemePresetsFor, themeColorsKey } from '@vismay/viz-engine'
import type { StoryTheme } from '@vismay/content-source/storyThemes'

/**
 * "Presets" strip for the story theme editor — the saved-theme library
 * (`story_themes`, via /api/story-themes) merged over the built-in per-app
 * presets compiled into the engine. Clicking a chip applies the preset to the
 * story's draft theme (a COPY into the frontmatter; the parent still Saves).
 * "Save current as preset…" writes the editor's current theme to the library,
 * scoped to this app or shared by every app, optionally as the app's default
 * (the theme new stories of the app are seeded from).
 *
 * Built-ins (footshorts Classic/Pitch/Terrace, vizf1 Paddock) always render —
 * even when the library is unreachable (fs-mode dev, missing service key) —
 * so the editor never loses its baseline looks; DB rows win by slug.
 */

interface Props {
  /** Real app slug (`vizf1`, not the `f1` vertical). */
  appSlug: string
  /** The editor's current draft theme — decides the highlighted chip. */
  current: Theme
  onApply: (theme: Theme) => void
}

/** A chip: a DB row, or a built-in that has no row yet. */
interface PresetItem {
  key: string
  id: string | null
  slug: string
  name: string
  appSlug: string | null
  theme: Theme
  isDefault: boolean
  builtin: boolean
}

type Scope = 'app' | 'shared'

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string }
    return j.error || fallback
  } catch {
    return fallback
  }
}

/** Fetch the app's saved themes; a failure is data (the "library unavailable" note), not a throw. */
async function fetchThemes(appSlug: string): Promise<{ rows: StoryTheme[]; error: string | null }> {
  try {
    const res = await fetch(`/api/story-themes?appSlug=${encodeURIComponent(appSlug)}`)
    if (!res.ok) {
      return { rows: [], error: await readError(res, `Theme library unavailable (${res.status})`) }
    }
    const j = (await res.json()) as { themes?: StoryTheme[] }
    return { rows: j.themes ?? [], error: null }
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : 'Theme library unavailable' }
  }
}

export default function ThemePresets({ appSlug, current, onApply }: Props) {
  const [rows, setRows] = useState<StoryTheme[] | null>(null)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Save form
  const [saving, setSaving] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveScope, setSaveScope] = useState<Scope>('app')
  const [saveDefault, setSaveDefault] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchThemes(appSlug).then((r) => {
      if (cancelled) return
      setRows(r.rows)
      setLibraryError(r.error)
    })
    return () => {
      cancelled = true
    }
  }, [appSlug])

  const load = useCallback(async () => {
    const r = await fetchThemes(appSlug)
    setRows(r.rows)
    setLibraryError(r.error)
  }, [appSlug])

  const items = useMemo<PresetItem[]>(() => {
    const bySlug = new Map<string, PresetItem>()
    for (const p of builtinThemePresetsFor(appSlug)) {
      bySlug.set(p.slug, {
        key: `builtin:${p.slug}`,
        id: null,
        slug: p.slug,
        name: p.name,
        appSlug: p.appSlug,
        theme: p.theme,
        isDefault: p.isDefault,
        builtin: true,
      })
    }
    for (const r of rows ?? []) {
      bySlug.set(r.slug, {
        key: `row:${r.id}`,
        id: r.id,
        slug: r.slug,
        name: r.name,
        appSlug: r.appSlug,
        theme: r.theme,
        isDefault: r.isDefault,
        builtin: r.builtin,
      })
    }
    // When the DB answered, its defaults are authoritative: a built-in flagged
    // default in code must not show as default if an editor moved it in the DB.
    if (rows && rows.length > 0) {
      const dbHasDefault = rows.some((r) => r.appSlug === appSlug && r.isDefault)
      for (const it of bySlug.values()) {
        if (it.id === null && dbHasDefault) it.isDefault = false
      }
    }
    return Array.from(bySlug.values()).sort((a, b) => {
      // App-owned first, then shared; within a group, default first, then name.
      const ga = a.appSlug === null ? 1 : 0
      const gb = b.appSlug === null ? 1 : 0
      if (ga !== gb) return ga - gb
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [rows, appSlug])

  const activeKey = useMemo(() => {
    const cur = themeColorsKey(current)
    return items.find((it) => themeColorsKey(it.theme) === cur)?.key ?? null
  }, [items, current])

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy(key)
    setActionError(null)
    try {
      await fn()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  function setDefault(item: PresetItem) {
    return withBusy(item.key, async () => {
      if (item.id) {
        const res = await fetch(`/api/story-themes/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isDefault: true }),
        })
        if (!res.ok) throw new Error(await readError(res, 'Could not set default'))
      } else {
        // A built-in with no row yet (migration not applied): materialise it as
        // its own row so the default sticks server-side.
        const res = await fetch('/api/story-themes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: item.name,
            appSlug: item.appSlug,
            theme: item.theme,
            isDefault: true,
          }),
        })
        if (!res.ok) throw new Error(await readError(res, 'Could not set default'))
      }
      await load()
    })
  }

  function remove(item: PresetItem) {
    if (!item.id) return
    if (!window.confirm(`Delete the "${item.name}" theme? Stories already using it keep their colours.`)) return
    return withBusy(item.key, async () => {
      const res = await fetch(`/api/story-themes/${item.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await readError(res, 'Could not delete theme'))
      await load()
    })
  }

  function saveCurrent() {
    const name = saveName.trim()
    if (!name) return
    return withBusy('save', async () => {
      const res = await fetch('/api/story-themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          appSlug: saveScope === 'shared' ? null : appSlug,
          theme: current,
          isDefault: saveScope === 'app' && saveDefault,
        }),
      })
      if (!res.ok) throw new Error(await readError(res, 'Could not save theme'))
      setSaving(false)
      setSaveName('')
      setSaveDefault(false)
      await load()
    })
  }

  return (
    <div className="space-y-3">
      {libraryError && (
        <div className="text-[11px] text-amber-300/80">
          Saved-theme library unavailable — showing built-in presets only. ({libraryError})
        </div>
      )}
      {actionError && (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
          <span className="min-w-0 break-words">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="shrink-0 text-red-300 hover:text-white"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map((it) => {
          const active = it.key === activeKey
          const isBusy = busy === it.key
          const c = it.theme.colors
          return (
            <div
              key={it.key}
              className={`group relative rounded-xl border p-2.5 transition-colors ${
                active
                  ? 'border-white/40 bg-white/[0.08]'
                  : 'border-white/10 bg-white/[0.03] hover:border-white/25'
              }`}
            >
              <button
                type="button"
                onClick={() => onApply(it.theme)}
                title={`Apply "${it.name}"`}
                className="block w-full text-left"
              >
                <div
                  className="flex h-9 overflow-hidden rounded-lg border"
                  style={{ borderColor: c.line ?? 'rgba(255,255,255,0.1)' }}
                >
                  <span className="flex-1" style={{ background: c.background }} />
                  <span className="flex-1" style={{ background: c.surface }} />
                  <span className="flex-1" style={{ background: c.accent }} />
                  <span className="flex-1" style={{ background: c.accent2 }} />
                </div>
                <div className="mt-2 flex items-center gap-1.5 min-w-0">
                  {active && <Check size={12} weight="bold" className="shrink-0 text-white" />}
                  <span className="text-[12px] font-medium truncate">{it.name}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1 text-[9px] uppercase tracking-wider text-neutral-500">
                  {it.isDefault && <span className="text-amber-300/80">default</span>}
                  {it.appSlug === null && <span>shared</span>}
                  {it.builtin && <span>built-in</span>}
                </div>
              </button>

              <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                {it.appSlug !== null && !it.isDefault && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void setDefault(it)}
                    title={`Make "${it.name}" the default for new ${appSlug} stories`}
                    className="rounded bg-black/60 p-1 text-neutral-300 hover:text-amber-300 disabled:opacity-50"
                  >
                    <Star size={12} />
                  </button>
                )}
                {!it.builtin && it.id && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void remove(it)}
                    title={`Delete "${it.name}"`}
                    className="rounded bg-black/60 p-1 text-neutral-300 hover:text-red-400 disabled:opacity-50"
                  >
                    <Trash size={12} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {saving ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveCurrent()
                if (e.key === 'Escape') setSaving(false)
              }}
              placeholder="Preset name"
              maxLength={80}
              className="flex-1 min-w-0 bg-black/30 rounded px-2 py-1.5 text-sm border border-white/10 focus:outline-none focus:border-white/30"
            />
            <button
              type="button"
              disabled={busy === 'save' || !saveName.trim()}
              onClick={() => void saveCurrent()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-white/20 disabled:opacity-40"
            >
              <FloppyDisk size={13} />
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setSaving(false)}
              className="rounded-lg border border-white/10 px-2 py-1.5 text-[12px] text-neutral-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-neutral-300">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="radio"
                name="theme-preset-scope"
                checked={saveScope === 'app'}
                onChange={() => setSaveScope('app')}
              />
              Only <span className="font-mono text-[11px]">{appSlug}</span>
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="radio"
                name="theme-preset-scope"
                checked={saveScope === 'shared'}
                onChange={() => {
                  setSaveScope('shared')
                  setSaveDefault(false)
                }}
              />
              All apps
            </label>
            <label
              className={`inline-flex items-center gap-1.5 ${saveScope === 'shared' ? 'opacity-40' : ''}`}
              title={saveScope === 'shared' ? 'Shared themes cannot be an app default' : undefined}
            >
              <input
                type="checkbox"
                disabled={saveScope === 'shared'}
                checked={saveDefault}
                onChange={(e) => setSaveDefault(e.target.checked)}
              />
              Make default for new {appSlug} stories
            </label>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSaving(true)}
          disabled={Boolean(libraryError)}
          title={libraryError ? 'Saving needs the theme library (database) to be reachable' : undefined}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-neutral-300 hover:border-white/30 hover:text-white disabled:opacity-40"
        >
          <FloppyDisk size={13} />
          Save current as preset…
        </button>
      )}
    </div>
  )
}
