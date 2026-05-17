'use client'

import { useMemo, useState } from 'react'
import { stringify as stringifyYaml } from 'yaml'
import {
  allRegisteredTypes,
  getVizModule,
  listModulesForSlot,
} from '@/components/story/viz/registry'
import type { VizSlot } from '@/components/story/viz/types'
import VizConfigForm from './VizConfigForm'

/**
 * Compose-viz helper. Pick a slot + viz type, fill the module's adminForm
 * fields, and copy the resulting YAML snippet into your `.config.yaml`.
 *
 * Lives inside the Assets tab so the slug-scoped asset list is available for
 * the asset picker dropdown (no need to type `assets://<slug>/foo.png` by hand
 * when a file is already uploaded).
 *
 * Phase 7b will graduate this into the Cards view — editing a section's
 * `foreground:` / `background:` block in-place via the same form schemas.
 */

type FormValue = string | number | boolean | object | null | undefined

interface ComposeVizPanelProps {
  /** `assets://<slug>/<file>` refs for the asset picker. */
  assetRefs: string[]
}

export default function ComposeVizPanel({ assetRefs }: ComposeVizPanelProps) {
  const [slot, setSlot] = useState<VizSlot>('foreground')
  const [type, setType] = useState<string>('image')
  const [value, setValue] = useState<Record<string, FormValue>>({})
  const [copied, setCopied] = useState(false)

  // Force a fresh allRegisteredTypes() call each render so verticals that load
  // after first paint show up too. Cheap (returns a small array).
  const availableTypes = useMemo(() => {
    const moduleTypes = listModulesForSlot(slot).map((m) => m.type)
    // Stable order: keep `allRegisteredTypes` ordering for the picker.
    return allRegisteredTypes().filter((t) => moduleTypes.includes(t))
    // Re-run on slot change + when the registry expands (verticals).
  }, [slot])

  const module = useMemo(() => getVizModule(type), [type])

  const yamlSnippet = useMemo(() => {
    const stripped: Record<string, FormValue> = {}
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined || v === null || v === '') continue
      stripped[k] = v
    }
    const layer = { type, ...stripped }
    // YAML output as a single foreground/background entry — paste under the
    // section's `foreground:` or `background:` array.
    return stringifyYaml({ [slot]: [layer] }, { lineWidth: 120 })
  }, [slot, type, value])

  // Reset value when the user switches viz type so leftover keys from the
  // previous form schema don't leak into the snippet.
  const onTypeChange = (next: string) => {
    setType(next)
    setValue({})
    setCopied(false)
  }

  const onSlotChange = (next: VizSlot) => {
    setSlot(next)
    // If current type isn't valid in the new slot, default to the first valid one.
    const valid = listModulesForSlot(next).map((m) => m.type)
    if (!valid.includes(type)) {
      const first = valid[0]
      if (first) {
        setType(first)
        setValue({})
      }
    }
  }

  const copyYaml = async () => {
    try {
      await navigator.clipboard.writeText(yamlSnippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard may be blocked in some browsers; the textarea is selectable */
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-[color:var(--color-line)] p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-xs uppercase tracking-wider text-[color:var(--color-muted)]">
          Compose viz YAML
        </h3>
      </header>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-mono uppercase tracking-wider text-[color:var(--color-muted)]">
            Slot
          </span>
          <select
            value={slot}
            onChange={(e) => onSlotChange(e.target.value as VizSlot)}
            className="rounded border border-[color:var(--color-line)] bg-transparent px-2 py-1.5 text-sm"
          >
            <option value="foreground">foreground</option>
            <option value="background">background</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-mono uppercase tracking-wider text-[color:var(--color-muted)]">
            Viz type
          </span>
          <select
            value={type}
            onChange={(e) => onTypeChange(e.target.value)}
            className="rounded border border-[color:var(--color-line)] bg-transparent px-2 py-1.5 text-sm"
          >
            {availableTypes.map((t) => {
              const m = getVizModule(t)
              return (
                <option key={t} value={t}>
                  {m?.label ?? t} ({t})
                </option>
              )
            })}
          </select>
        </label>
      </div>

      {module && (
        <div className="mb-4">
          <VizConfigForm
            module={module}
            value={value}
            onChange={setValue}
            assetRefs={assetRefs}
          />
        </div>
      )}

      <div className="rounded border border-[color:var(--color-line)] bg-black/20">
        <div className="flex items-center justify-between border-b border-[color:var(--color-line)] px-3 py-2">
          <span className="text-xs font-mono uppercase tracking-wider text-[color:var(--color-muted)]">
            YAML snippet
          </span>
          <button
            type="button"
            onClick={copyYaml}
            className="text-xs font-mono uppercase tracking-wider px-2 py-1 rounded border border-[color:var(--color-line)] hover:border-[color:var(--color-accent)]"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="p-3 text-xs font-mono whitespace-pre-wrap text-[color:var(--color-text)] overflow-x-auto">
          {yamlSnippet}
        </pre>
      </div>
    </section>
  )
}
