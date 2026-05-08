'use client'

/**
 * Per-unit TTS narration override panel for the admin Narration tab.
 *
 * Each mobile unit gets a textarea pre-filled with its current narration
 * (override if saved, else default derived from heading + paragraphs). Users
 * edit, hit Save to persist the YAML, then optionally hit Regenerate audio
 * to fire the GitHub Actions workflow. Only edited units are written to YAML
 * — empty / unchanged-from-default rows stay out of the file so it doesn't
 * grow with no-op entries.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { stringify as stringifyYaml } from 'yaml'
import { parseTtsConfig, TTS_SKIP_IDS } from '@/lib/storyTts'

export interface NarrationUnit {
  parentIndex: number
  subIndex: number
  sliceIndex: number
  /** Section id from config.yaml (used to flag skipTts methodology units). */
  sectionId: string | undefined
  /** Display label in the panel ("§1.0.0 · text · 'Heading…'"). */
  label: string
  /** The default text the audio script would send to Gemini. */
  defaultScript: string
  /** Heading + first paragraph snippet, for the in-card preview. */
  preview: string
}

interface Props {
  slug: string
  units: NarrationUnit[]
  initialYaml: string | null
}

interface UnitState {
  parentIndex: number
  subIndex: number
  sliceIndex: number
  /** Empty string = no override; falls back to defaultScript at render time. */
  script: string
}

function unitKey(u: { parentIndex: number; subIndex: number; sliceIndex: number }): string {
  return `${u.parentIndex}.${u.subIndex}.${u.sliceIndex}`
}

function buildInitialState(
  units: NarrationUnit[],
  initialYaml: string | null
): UnitState[] {
  const config = parseTtsConfig(initialYaml)
  const overrides = new Map<string, string>()
  if (config) {
    for (const u of config.units) overrides.set(unitKey(u), u.script)
  }
  return units.map((u) => ({
    parentIndex: u.parentIndex,
    subIndex: u.subIndex,
    sliceIndex: u.sliceIndex,
    script: overrides.get(unitKey(u)) ?? '',
  }))
}

function serializeToYaml(states: UnitState[]): string {
  const out: Array<{
    unit: { parentIndex: number; subIndex: number; sliceIndex: number }
    script: string
  }> = []
  for (const s of states) {
    if (!s.script.trim()) continue
    out.push({
      unit: {
        parentIndex: s.parentIndex,
        subIndex: s.subIndex,
        sliceIndex: s.sliceIndex,
      },
      script: s.script.trim(),
    })
  }
  if (out.length === 0) return ''
  return stringifyYaml({ units: out })
}

export default function NarrationEditor({ slug, units, initialYaml }: Props) {
  const [states, setStates] = useState<UnitState[]>(() =>
    buildInitialState(units, initialYaml)
  )
  const [savedYaml, setSavedYaml] = useState<string>(initialYaml ?? '')
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [status, setStatus] = useState<{ type: 'idle' | 'ok' | 'err' | 'info'; msg?: string }>({
    type: 'idle',
  })

  const draftYaml = useMemo(() => serializeToYaml(states), [states])
  const dirty = draftYaml !== savedYaml

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const updateScript = useCallback((idx: number, script: string) => {
    setStates((prev) => {
      const next = prev.slice()
      next[idx] = { ...next[idx], script }
      return next
    })
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setStatus({ type: 'idle' })
    try {
      const res = await fetch(`/api/admin/stories/${slug}/tts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: draftYaml }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setSavedYaml(draftYaml)
      setStatus({ type: 'ok', msg: 'Saved' })
    } catch (err) {
      setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }, [draftYaml, slug])

  const handleRegenerate = useCallback(async () => {
    setRegenerating(true)
    setStatus({ type: 'idle' })
    try {
      const res = await fetch(`/api/admin/stories/${slug}/audio/regen`, {
        method: 'POST',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      if (body.mode === 'unconfigured') {
        setStatus({
          type: 'info',
          msg: 'Dispatch not configured — run `npx tsx scripts/generate-audio.ts ' + slug + ' --force` locally',
        })
      } else {
        setStatus({
          type: 'ok',
          msg: 'Audio regen kicked off — check /story/' + slug + '/autoplay in a few minutes',
        })
      }
    } catch (err) {
      setStatus({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Regenerate failed',
      })
    } finally {
      setRegenerating(false)
    }
  }, [slug])

  const overrideCount = useMemo(
    () => states.filter((s) => s.script.trim()).length,
    [states]
  )

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3 bg-neutral-900/40 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Narration overrides</div>
          <div className="text-xs text-neutral-500">
            {overrideCount > 0
              ? `${overrideCount} of ${units.length} units overridden`
              : `${units.length} units · all default`}
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="text-xs px-3 py-1.5 rounded text-neutral-300 hover:text-white hover:bg-white/5 disabled:opacity-40 border border-white/10"
        >
          {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={dirty || regenerating}
          title={dirty ? 'Save first' : 'Run scripts/generate-audio.ts on Actions'}
          className="text-xs px-3 py-1.5 rounded bg-white text-neutral-950 disabled:opacity-40"
        >
          {regenerating ? 'Dispatching…' : 'Regenerate audio'}
        </button>
      </div>

      {status.type !== 'idle' && (
        <div
          className={`px-4 py-2 text-xs border-b border-white/5 shrink-0 ${
            status.type === 'err'
              ? 'bg-red-950/20 text-red-300'
              : status.type === 'info'
                ? 'bg-amber-950/20 text-amber-200'
                : 'bg-emerald-950/20 text-emerald-300'
          }`}
        >
          {status.msg}
        </div>
      )}

      <div className="flex-1 overflow-y-auto divide-y divide-white/5">
        {units.map((u, i) => (
          <UnitRow
            key={unitKey(u)}
            unit={u}
            state={states[i]}
            onChange={(script) => updateScript(i, script)}
          />
        ))}
      </div>
    </div>
  )
}

function UnitRow({
  unit,
  state,
  onChange,
}: {
  unit: NarrationUnit
  state: UnitState
  onChange: (script: string) => void
}) {
  const isSkipped = unit.sectionId ? TTS_SKIP_IDS.has(unit.sectionId) : false
  const isOverridden = state.script.trim().length > 0

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-500">
        <span>§{unit.parentIndex}.{unit.subIndex}.{unit.sliceIndex}</span>
        <span className="opacity-60">·</span>
        <span className="truncate">{unit.label}</span>
        {isSkipped && (
          <span className="ml-auto text-[10px] uppercase tracking-wider border border-amber-500/30 text-amber-300/80 rounded px-1.5 py-0.5 shrink-0">
            no audio
          </span>
        )}
        {isOverridden && !isSkipped && (
          <span className="ml-auto text-[10px] uppercase tracking-wider border border-emerald-500/30 text-emerald-300/80 rounded px-1.5 py-0.5 shrink-0">
            override
          </span>
        )}
      </div>
      {unit.preview && (
        <div className="text-xs text-neutral-400 line-clamp-2">{unit.preview}</div>
      )}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-neutral-600 mb-1">
          Default narration
        </div>
        <div className="text-xs text-neutral-500 italic whitespace-pre-wrap mb-2">
          {unit.defaultScript || <span className="opacity-60">(empty — no narration)</span>}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-neutral-600 mb-1">
          Override
        </div>
        <textarea
          value={state.script}
          onChange={(e) => onChange(e.target.value)}
          disabled={isSkipped}
          placeholder={
            isSkipped
              ? 'This section is excluded from TTS (skipTts).'
              : 'Leave blank to use the default above.'
          }
          rows={3}
          spellCheck={true}
          className="w-full bg-neutral-950 text-neutral-100 font-mono text-[12px] leading-relaxed p-2 rounded border border-white/10 resize-vertical focus:outline-none focus:border-white/30 disabled:opacity-40"
        />
      </div>
    </div>
  )
}
