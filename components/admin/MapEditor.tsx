'use client'

/**
 * Autoplay map override editor.
 *
 * Lists every (parentIndex, subIndex?) target in the story. Each row
 * shows the current camera state — base or overridden — and an "Edit"
 * button that opens the existing MapPickerModal (the same interactive
 * Mapbox canvas the Config tab and Reports tab use). The modal's
 * Desktop/Mobile target toggle maps to the autoplay 16:9 / 9:16 video
 * renders respectively (mobile = portrait override).
 *
 * The override applies ONLY in autoplay (`?autoplay=1`) — see
 * lib/storyMapOverrides.ts and StoryMapShell. Scrollytelling readers see
 * the unmodified config.yaml.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import MapPickerModal from './MapPickerModal'
import {
  hydrateOverrides,
  parseMapOverrides,
  serializeOverrides,
  type MapTarget,
  type TargetCameraOverride,
} from '@/lib/storyMapOverrides'
import {
  applyMapView,
  applyMobileMapView,
  extractMapView,
  extractMobileMapView,
  type MapView,
} from '@/lib/yamlMapPatch'

interface Props {
  slug: string
  targets: MapTarget[]
  initialYaml: string | null
  mapStyle: string
}

export default function MapEditor({ slug, targets, initialYaml, mapStyle }: Props) {
  const initialState = useMemo(
    () => hydrateOverrides(parseMapOverrides(initialYaml)),
    [initialYaml]
  )
  const [overrides, setOverrides] = useState<Map<string, TargetCameraOverride>>(initialState)
  const [savedSerialized, setSavedSerialized] = useState<string | null>(initialYaml)
  const [editing, setEditing] = useState<string | null>(null) // target.key
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'idle' | 'ok' | 'err'; msg?: string }>({
    type: 'idle',
  })

  const currentSerialized = useMemo(
    () => serializeOverrides(overrides, targets),
    [overrides, targets]
  )
  const dirty = (currentSerialized ?? '') !== (savedSerialized ?? '')
  const overrideCount = overrides.size

  // Warn before navigating away with unsaved work.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setStatus({ type: 'idle' })
    try {
      const res = await fetch(`/api/admin/stories/${slug}/map`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: currentSerialized ?? '' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setSavedSerialized(currentSerialized)
      setStatus({ type: 'ok', msg: 'Saved' })
    } catch (err) {
      setStatus({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Save failed',
      })
    } finally {
      setSaving(false)
    }
  }, [currentSerialized, slug])

  // Cmd/Ctrl+S to save — same affordance as the Config tab.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (dirty && !saving) void handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [dirty, saving, handleSave])

  const editingTarget = editing ? targets.find((t) => t.key === editing) ?? null : null

  // Build the synthetic section YAML the modal expects: starts at the
  // currently effective camera (override if set, else base) so dragging
  // produces sensible diffs. Mobile block is only included when the user
  // has an existing mobile override — otherwise the modal's "no mobile
  // override yet" hint kicks in and gives the user a clean starting point.
  const editingSectionRaw = useMemo(() => {
    if (!editingTarget) return ''
    const o = overrides.get(editingTarget.key)
    const desktop = o?.desktop ?? editingTarget.baseDesktop
    const mobile = o?.mobile ?? null
    return buildSectionRaw(desktop, mobile)
  }, [editingTarget, overrides])

  const handleApply = useCallback(
    (nextRaw: string) => {
      if (!editingTarget) return
      const desktopAfter = extractMapView(nextRaw)
      const mobileAfter = extractMobileMapView(nextRaw)
      setOverrides((prev) => {
        const next = new Map(prev)
        const entry: TargetCameraOverride = {}
        if (desktopAfter) entry.desktop = desktopAfter
        if (mobileAfter) entry.mobile = mobileAfter
        if (entry.desktop || entry.mobile) {
          next.set(editingTarget.key, entry)
        } else {
          next.delete(editingTarget.key)
        }
        return next
      })
      setEditing(null)
    },
    [editingTarget]
  )

  const handleReset = useCallback((key: string) => {
    setOverrides((prev) => {
      if (!prev.has(key)) return prev
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }, [])

  if (targets.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm p-8 text-center">
        No story config — map overrides need a valid <code className="font-mono mx-1">{slug}.config.yaml</code> first.
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3 bg-neutral-900/40 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Autoplay map overrides</div>
          <div className="text-xs text-neutral-500">
            {overrideCount > 0
              ? `${overrideCount} override${overrideCount === 1 ? '' : 's'} · applies in ?autoplay=1 only`
              : `${targets.length} targets · all default · applies in ?autoplay=1 only`}
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="text-sm px-3 py-1.5 rounded-md bg-white text-neutral-950 disabled:opacity-40 active:bg-neutral-200"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {status.type !== 'idle' && (
        <div
          className={`px-4 py-2 text-xs border-b border-white/5 shrink-0 ${
            status.type === 'err'
              ? 'text-red-300 bg-red-950/20'
              : 'text-emerald-300 bg-emerald-950/20'
          }`}
        >
          {status.msg}
        </div>
      )}

      <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-white/5">
        {targets.map((t) => {
          const o = overrides.get(t.key)
          const overridden = !!o
          return (
            <li key={t.key} className="px-4 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate flex items-center gap-2">
                  <span>{t.label}</span>
                  {overridden && (
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      override · {overrideMode(o)}
                    </span>
                  )}
                </div>
                <div className="text-xs text-neutral-500 font-mono mt-0.5 truncate">
                  16:9 {fmtView(o?.desktop ?? t.baseDesktop)}
                  {(o?.mobile || t.baseMobile) && (
                    <>
                      {' · '}
                      9:16 {fmtView(o?.mobile ?? t.baseMobile ?? t.baseDesktop)}
                    </>
                  )}
                </div>
              </div>
              {overridden && (
                <button
                  type="button"
                  onClick={() => handleReset(t.key)}
                  className="text-xs text-neutral-400 hover:text-red-300 shrink-0"
                  title="Drop this override; renderer falls back to config.yaml"
                >
                  reset
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditing(t.key)}
                className="text-xs px-2 py-1 rounded border border-white/10 text-neutral-200 hover:bg-white/5 shrink-0"
              >
                edit ↗
              </button>
            </li>
          )
        })}
      </ul>

      {editingTarget && (
        <MapPickerModal
          sectionRaw={editingSectionRaw}
          sectionLabel={editingTarget.label}
          style={mapStyle}
          onApply={handleApply}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function buildSectionRaw(desktop: MapView, mobile: MapView | null): string {
  // Start with a `map:` block stub that yamlMapPatch.applyMapView will
  // populate cleanly (it inserts under the parent when keys are missing).
  // Round-tripping through applyMapView/applyMobileMapView keeps the
  // exact format the modal expects — no precision drift between this
  // path and the Config tab's modal usage.
  let raw = 'map:\n'
  raw = applyMapView(raw, desktop)
  if (mobile) raw = applyMobileMapView(raw, mobile)
  return raw
}

function overrideMode(o: TargetCameraOverride | undefined): string {
  if (!o) return ''
  if (o.desktop && o.mobile) return 'both'
  if (o.mobile) return '9:16'
  return '16:9'
}

function fmtView(v: MapView): string {
  return `[${v.center[0].toFixed(2)},${v.center[1].toFixed(2)}] z${v.zoom.toFixed(1)}${
    v.pitch ? ` p${v.pitch.toFixed(0)}` : ''
  }${v.bearing ? ` b${v.bearing.toFixed(0)}` : ''}`
}
