'use client'

/**
 * Autoplay map override editor — right-side panel on /story/<slug>/autoplay.
 *
 * Lists every (parentIndex, subIndex?) target in the story. Each row opens
 * MapPickerModal — the same interactive Mapbox canvas the Config tab and
 * Reports tab use, with focal-area overlay, Apply button, lng/lat/zoom/pitch
 * readouts, and the Desktop/Mobile target toggle (Desktop = autoplay 16:9,
 * Mobile = autoplay 9:16).
 *
 * A collapsible YAML drawer at the bottom lets power users edit the raw
 * `overrides:` blob — useful for bulk paste, hand-tuned values, or reading
 * what the visual editor produces. Two-way sync: visual edits serialize into
 * the textarea; valid YAML edits hydrate back into per-target state.
 *
 * Save persists to `stories.map_yaml`; the override applies only when the
 * story renders with `?autoplay=1` (autoplay page + the rendered MP4).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import MapPickerModal from '@/components/MapPickerModal'
import {
  hydrateOverrides,
  parseMapOverrides,
  serializeOverrides,
  type MapTarget,
  type TargetCameraOverride,
} from '@vismay/viz-engine'
import {
  applyMapView,
  applyMobileMapView,
  extractMapView,
  extractMobileMapView,
  type MapView,
} from '@vismay/viz-engine'
import { useTabIndent } from '@vismay/content-source/useTabIndent'

interface Props {
  slug: string
  targets: MapTarget[]
  initialYaml: string | null
  mapStyle: string
  onClose?: () => void
  /**
   * Fired after a successful PUT to admin's `/api/vizmaya/stories/<slug>/map`.
   * AutoplayShell uses this to reload the preview iframe so the fresh
   * overrides take effect immediately instead of waiting for ISR.
   */
  onSaved?: () => void
  /** Admin base URL — cross-TLD save target. See docs/auth.md. */
  adminBaseUrl: string
  /** Action token granting `edit-story-map` for this slug. */
  editStoryMapToken: string
}

const YAML_PLACEHOLDER = `# Autoplay map overrides — edited above visually or here as raw YAML.
# Identity: { parentIndex, subIndex? }. Omit subIndex to override the parent
# section's map block; include it to override one subsection. Field-level
# merge — only the keys you set are touched.
#
# overrides:
#   - target: { parentIndex: 0 }
#     map:
#       center: [-95.0, 40.0]
#       zoom: 4
#       pitch: 30
#       bearing: 0
#       # Portrait-only (9:16) sub-layer — applied on top of the desktop
#       # values when the autoplay render is vertical.
#       mobile:
#         center: [-95.0, 38.0]
#         zoom: 3.4
#   - target: { parentIndex: 0, subIndex: 1 }
#     map:
#       zoom: 6
`

export default function AutoplayMapEditor({
  slug,
  targets,
  initialYaml,
  mapStyle,
  onClose,
  onSaved,
  adminBaseUrl,
  editStoryMapToken,
}: Props) {
  const initialState = useMemo(
    () => hydrateOverrides(parseMapOverrides(initialYaml)),
    [initialYaml]
  )
  const [overrides, setOverrides] = useState<Map<string, TargetCameraOverride>>(initialState)
  const [savedSerialized, setSavedSerialized] = useState<string | null>(initialYaml)
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'idle' | 'ok' | 'err'; msg?: string }>({
    type: 'idle',
  })

  /* ─── YAML drawer ─────────────────────────────────────────────────── */

  const [yamlOpen, setYamlOpen] = useState(false)
  // The textarea's text. Initialised from the initial YAML so the user sees
  // the source they're inheriting; visual edits keep this in sync via the
  // commit helper below. Direct YAML edits live here until they parse cleanly.
  const [yamlDraft, setYamlDraft] = useState<string>(initialYaml ?? '')
  const [yamlParseError, setYamlParseError] = useState<string | null>(null)
  const onTabKey = useTabIndent()

  // Mutate `overrides` AND keep the YAML pane in sync. Use this from every
  // visual edit path so the textarea always shows the latest serialised
  // state — otherwise the textarea would drift after a modal Apply or reset
  // and the user would think YAML edits had been lost.
  const commitOverrides = useCallback(
    (next: Map<string, TargetCameraOverride>) => {
      setOverrides(next)
      setYamlDraft(serializeOverrides(next, targets) ?? '')
      setYamlParseError(null)
    },
    [targets]
  )

  // YAML-side edits: try to parse on every keystroke. Valid → swap state.
  // Invalid → leave state alone, surface a small inline error so the user
  // knows their typing isn't being applied yet.
  const handleYamlChange = useCallback(
    (text: string) => {
      setYamlDraft(text)
      if (text.trim().length === 0) {
        setOverrides(new Map())
        setYamlParseError(null)
        return
      }
      const parsed = parseMapOverrides(text)
      if (parsed === null) {
        setYamlParseError('YAML failed to parse — fix to apply')
        return
      }
      setOverrides(hydrateOverrides(parsed))
      setYamlParseError(null)
    },
    []
  )

  /* ─── Dirty / save tracking ──────────────────────────────────────── */

  const currentSerialized = useMemo(
    () => serializeOverrides(overrides, targets),
    [overrides, targets]
  )
  const dirty = (currentSerialized ?? '') !== (savedSerialized ?? '')
  const overrideCount = overrides.size

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
      const res = await fetch(`${adminBaseUrl}/api/vizmaya/stories/${slug}/map`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-action-token': editStoryMapToken,
        },
        credentials: 'omit',
        body: JSON.stringify({ raw: currentSerialized ?? '' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setSavedSerialized(currentSerialized)
      setStatus({ type: 'ok', msg: 'Saved' })
      onSaved?.()
    } catch (err) {
      setStatus({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Save failed',
      })
    } finally {
      setSaving(false)
    }
  }, [currentSerialized, slug, onSaved, adminBaseUrl, editStoryMapToken])

  // Cmd/Ctrl+S to save.
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

  /* ─── Modal wiring ───────────────────────────────────────────────── */

  const editingTarget = editing ? targets.find((t) => t.key === editing) ?? null : null

  // Hand the modal a synthetic section YAML starting at the currently
  // effective camera (override if set, else base) so dragging produces
  // intuitive diffs. Mobile is only included when there's an existing
  // mobile override — the modal's "no mobile override yet" hint fires when
  // it's absent, which gives the user a clean starting point.
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
      const next = new Map(overrides)
      const entry: TargetCameraOverride = {}
      if (desktopAfter) entry.desktop = desktopAfter
      if (mobileAfter) entry.mobile = mobileAfter
      if (entry.desktop || entry.mobile) {
        next.set(editingTarget.key, entry)
      } else {
        next.delete(editingTarget.key)
      }
      commitOverrides(next)
      setEditing(null)
    },
    [editingTarget, overrides, commitOverrides]
  )

  const handleReset = useCallback(
    (key: string) => {
      if (!overrides.has(key)) return
      const next = new Map(overrides)
      next.delete(key)
      commitOverrides(next)
    },
    [overrides, commitOverrides]
  )

  /* ─── Render ─────────────────────────────────────────────────────── */

  if (targets.length === 0) {
    return (
      <PanelShell onClose={onClose} title="Map overrides">
        <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm p-6 text-center">
          No story config — overrides need a valid <code className="font-mono mx-1">{slug}.config.yaml</code> first.
        </div>
      </PanelShell>
    )
  }

  return (
    <PanelShell
      onClose={onClose}
      title="Map overrides"
      subtitle={
        overrideCount > 0
          ? `${overrideCount} override${overrideCount === 1 ? '' : 's'} · applies in ?autoplay=1`
          : `${targets.length} targets · all default`
      }
    >
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
            <li key={t.key} className="px-3 py-2.5 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] truncate flex items-center gap-2">
                  <span className="truncate">{t.label}</span>
                  {overridden && (
                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                      {overrideMode(o)}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-neutral-500 font-mono mt-0.5 truncate">
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
                  className="text-[10px] uppercase tracking-wider text-neutral-500 hover:text-red-300 shrink-0 px-1.5 py-1"
                  title="Drop this override; renderer falls back to config.yaml"
                >
                  reset
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditing(t.key)}
                className="text-[11px] px-2 py-1 rounded border border-white/10 text-neutral-200 hover:bg-white/5 shrink-0"
              >
                edit ↗
              </button>
            </li>
          )
        })}
      </ul>

      {/* YAML drawer ─ collapsible by design so the visual list is the
          primary surface. Power users expand it for raw edits / paste. */}
      <details
        className="border-t border-white/5 bg-neutral-950/60 shrink-0 max-h-[45%] flex flex-col [&[open]]:flex [&[open]]:flex-col"
        open={yamlOpen}
        onToggle={(e) => setYamlOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary
          className="cursor-pointer select-none px-3 py-2 text-[11px] uppercase tracking-wider text-neutral-400 hover:text-white flex items-center justify-between gap-2"
        >
          <span>YAML</span>
          <span className="text-[10px] text-neutral-500 font-mono normal-case tracking-normal">
            {yamlParseError
              ? <span className="text-red-300">{yamlParseError}</span>
              : currentSerialized
                ? `${currentSerialized.split('\n').length} lines`
                : 'empty'}
          </span>
        </summary>
        <textarea
          value={yamlDraft}
          onChange={(e) => handleYamlChange(e.target.value)}
          onKeyDown={onTabKey}
          placeholder={YAML_PLACEHOLDER}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          className="min-h-[200px] flex-1 w-full bg-neutral-950 text-neutral-100 placeholder:text-neutral-600 font-mono text-[12px] leading-relaxed p-3 resize-none outline-none border-t border-white/5"
        />
      </details>

      <div className="border-t border-white/10 bg-neutral-950/95 backdrop-blur flex items-center gap-2 px-3 py-2 shrink-0">
        <span className="text-[11px] text-neutral-500 flex-1">
          {dirty ? 'Unsaved changes' : 'No changes'}
        </span>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="text-sm px-3 py-1.5 rounded-md bg-white text-neutral-950 disabled:opacity-40 active:bg-neutral-200"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {editingTarget && (
        <MapPickerModal
          sectionRaw={editingSectionRaw}
          sectionLabel={editingTarget.label}
          style={mapStyle}
          onApply={handleApply}
          onClose={() => setEditing(null)}
        />
      )}
    </PanelShell>
  )
}

function PanelShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  onClose?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="h-full w-full min-w-0 flex flex-col bg-neutral-950 text-neutral-100 border-l border-white/10">
      <header className="px-3 py-2.5 border-b border-white/10 flex items-center gap-2 shrink-0 bg-neutral-900/50">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-tight">{title}</div>
          {subtitle && (
            <div className="text-[11px] text-neutral-500 truncate">{subtitle}</div>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded text-neutral-400 hover:text-white hover:bg-white/5"
            aria-label="Close"
          >
            ×
          </button>
        )}
      </header>
      {children}
    </div>
  )
}

function buildSectionRaw(desktop: MapView, mobile: MapView | null): string {
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
