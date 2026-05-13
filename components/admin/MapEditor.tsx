'use client'

/**
 * Map override panel for the admin Map tab.
 *
 * Layout: YAML textarea on the left, live Mapbox preview on the right.
 * The preview shows the currently-selected target (parent section or
 * subsection) with the draft YAML merged on top of the base config —
 * so unsaved edits are reflected immediately. Invalid YAML keeps the
 * last good preview rather than blanking out.
 *
 * Save → PUT /api/admin/stories/<slug>/map. The renderer picks the file
 * up via `applyMapOverrides` inside `loadStoryConfig`; no extra cache
 * step is needed.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from 'react'
import {
  applyMapOverrides,
  parseMapOverrides,
} from '@/lib/storyMapOverrides'
import type {
  StoryConfig,
  StorySectionConfig,
} from '@/lib/storyConfig.types'
import { useTabIndent } from '@/lib/useTabIndent'
import type MapboxBackgroundType from '@/components/story/charts/MapboxBackground'
import type { MapStep } from '@/components/story/charts/MapboxBackground'

type MapboxBackgroundProps = React.ComponentProps<typeof MapboxBackgroundType>

/** Client-only loader — same pattern as StoryMapShell uses. mapbox-gl
 * touches `window` at import time, so it can never run on the server. */
function MapboxBackground(props: MapboxBackgroundProps) {
  const [Comp, setComp] = useState<ComponentType<MapboxBackgroundProps> | null>(
    null
  )
  useEffect(() => {
    let cancelled = false
    import('@/components/story/charts/MapboxBackground').then((m) => {
      if (!cancelled) setComp(() => m.default)
    })
    return () => {
      cancelled = true
    }
  }, [])
  if (!Comp) return null
  return <Comp {...props} />
}

interface Props {
  slug: string
  /** Resolved StoryConfig — used to render the base map for the selected target. */
  config: StoryConfig
  initialYaml: string | null
  accessToken: string
}

interface TargetOption {
  value: string // "0" or "0.2"
  label: string
  parentIndex: number
  subIndex: number | undefined
}

function buildTargets(sections: StorySectionConfig[]): TargetOption[] {
  const out: TargetOption[] = []
  sections.forEach((s, i) => {
    const parentLabel = s.id ?? s.text ?? `section ${i}`
    out.push({
      value: `${i}`,
      label: `${i}. ${parentLabel}`,
      parentIndex: i,
      subIndex: undefined,
    })
    s.subsections?.forEach((sub, j) => {
      out.push({
        value: `${i}.${j}`,
        label: `   ${i}.${j} · ${sub.id ?? sub.text ?? `sub ${j}`}`,
        parentIndex: i,
        subIndex: j,
      })
    })
  })
  return out
}

/** Resolve the map step for a given target after overrides are applied —
 * mirrors the resolution logic in StoryMapShell so the preview matches
 * what the story will actually show. */
function resolveMapStep(
  config: StoryConfig,
  parentIndex: number,
  subIndex: number | undefined
): MapStep | null {
  const section = config.sections[parentIndex]
  if (!section) return null
  const parentMap = section.map
  const sub =
    subIndex !== undefined ? section.subsections?.[subIndex] : undefined
  const over = sub?.map
  return {
    center: over?.center ?? parentMap.center,
    zoom: over?.zoom ?? parentMap.zoom,
    pitch: over?.pitch ?? parentMap.pitch,
    bearing: over?.bearing ?? parentMap.bearing,
    flySpeed: over?.flySpeed ?? parentMap.flySpeed,
    opacity: over?.opacity ?? parentMap.opacity,
    pins: over?.pins ?? parentMap.pins,
    regions: over?.regions ?? parentMap.regions,
    heatmap: over?.heatmap ?? parentMap.heatmap,
  }
}

const PLACEHOLDER = `# Override the camera and pins per section / subsection.
# Identity: { parentIndex, subIndex? }. Omit subIndex to target the
# parent section's map block.
#
# overrides:
#   - target: { parentIndex: 0 }
#     map:
#       center: [-95.0, 40.0]
#       zoom: 4
#       pins:
#         - coordinates: [-95.0, 40.0]
#           label: "Mid-continent"
#   - target: { parentIndex: 0, subIndex: 1 }
#     map:
#       zoom: 6
`

export default function MapEditor({
  slug,
  config,
  initialYaml,
  accessToken,
}: Props) {
  const targets = useMemo(() => buildTargets(config.sections), [config])
  const [target, setTarget] = useState<string>(targets[0]?.value ?? '')
  const [draft, setDraft] = useState<string>(initialYaml ?? '')
  const [savedYaml, setSavedYaml] = useState<string>(initialYaml ?? '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{
    type: 'idle' | 'ok' | 'err' | 'info'
    msg?: string
  }>({ type: 'idle' })
  const onTabKey = useTabIndent()

  const dirty = draft !== savedYaml

  // Derive the merged config from the draft; falls back to the base config
  // if parse fails so the preview never blanks during typing.
  const mergedConfig = useMemo(() => {
    const parsed = parseMapOverrides(draft)
    if (!parsed) return config
    try {
      return applyMapOverrides(config, parsed)
    } catch {
      return config
    }
  }, [config, draft])

  const selected = targets.find((t) => t.value === target) ?? targets[0]
  const step = useMemo(
    () =>
      selected
        ? resolveMapStep(mergedConfig, selected.parentIndex, selected.subIndex)
        : null,
    [mergedConfig, selected]
  )

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
        body: JSON.stringify({ raw: draft }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setSavedYaml(draft)
      setStatus({ type: 'ok', msg: 'Saved' })
    } catch (err) {
      setStatus({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Save failed',
      })
    } finally {
      setSaving(false)
    }
  }, [draft, slug])

  const overrideCount = useMemo(() => {
    const parsed = parseMapOverrides(draft)
    return parsed?.overrides.length ?? 0
  }, [draft])

  const parseError = useMemo(() => {
    if (!draft.trim()) return null
    const parsed = parseMapOverrides(draft)
    if (parsed === null) return 'YAML failed to parse'
    return null
  }, [draft])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3 bg-neutral-900/40 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Map overrides</div>
          <div className="text-xs text-neutral-500">
            {overrideCount > 0
              ? `${overrideCount} override${overrideCount === 1 ? '' : 's'} · ${targets.length} targets total`
              : `${targets.length} targets · all default`}
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

      {(status.type !== 'idle' || parseError) && (
        <div
          className={`px-4 py-2 text-xs border-b border-white/5 shrink-0 ${
            status.type === 'err' || parseError
              ? 'text-red-300 bg-red-950/20'
              : status.type === 'ok'
                ? 'text-emerald-300 bg-emerald-950/20'
                : 'text-neutral-300 bg-neutral-900/40'
          }`}
        >
          {parseError ?? status.msg}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 [@media(min-aspect-ratio:1/1)]:grid-cols-2 min-h-0">
        <div className="flex flex-col min-h-0 border-r border-white/5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onTabKey}
            placeholder={PLACEHOLDER}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className="flex-1 min-h-0 w-full bg-neutral-950 text-neutral-100 font-mono text-[13px] leading-relaxed p-4 resize-none outline-none focus:bg-neutral-900/40"
          />
        </div>

        <div className="flex flex-col min-h-0 bg-neutral-950">
          <div className="px-3 py-2 border-b border-white/5 shrink-0 flex items-center gap-2">
            <label className="text-xs text-neutral-500">Preview</label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="bg-neutral-900 border border-white/10 rounded text-xs text-neutral-100 px-2 py-1 flex-1 min-w-0"
            >
              {targets.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-h-[320px] relative">
            {step ? (
              <MapboxBackground
                accessToken={accessToken}
                steps={[step]}
                activeStep={0}
                style={mergedConfig.defaults.mapStyle}
                defaultPinColor={mergedConfig.defaults.pinColor}
                defaultPinRadius={mergedConfig.defaults.pinRadius}
                defaultOpacity={mergedConfig.defaults.mapOpacity}
                highlightCountry={mergedConfig.defaults.highlightCountry}
                highlightColor={mergedConfig.defaults.highlightColor}
                palette={mergedConfig.defaults.mapPalette}
                fontstack={mergedConfig.defaults.mapFontstack}
                interactive={false}
                staticCapture
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-neutral-500 text-sm">
                No section selected
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
