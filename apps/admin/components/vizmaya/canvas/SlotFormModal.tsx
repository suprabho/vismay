'use client'

/**
 * Generic form-based editor for a single viz layer (foreground or background
 * slot). Hosts the module's `adminForm()` schema via the shared
 * `<VizConfigForm>` — the same renderer the Assets-tab ComposeVizPanel uses —
 * so deck slots (bigStat / bodyText / quote / keyValue / table / imageGrid)
 * and any other module that declares a form (text / embed / video / rive) can
 * be edited with proper inputs instead of raw YAML.
 *
 * `map` (no adminForm) and `image` (bespoke ImageEditModal) never reach here;
 * the CanvasClient dispatcher routes them elsewhere. Types with no adminForm
 * (chart) also bypass this and land in the YAML editor.
 *
 * Mounted as a portal so the modal escapes Rete's stacking context — same
 * reason MapPickerModal / ImageEditModal portal to <body>.
 */

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { getVizModule } from '@vismay/viz-engine'
import VizConfigForm from '../VizConfigForm'

type FormValue = string | number | boolean | object | null | undefined

interface Props {
  sectionLabel: string
  layerType: string
  /** On-disk layer object, used to seed the form. */
  initialLayer: Record<string, unknown>
  saving: boolean
  error: string | null
  /** Uploaded asset refs for the asset picker; `[]` falls back to free-text. */
  assetRefs: string[]
  onApply: (next: Record<string, unknown>) => void
  onEditAsYaml: () => void
  onClose: () => void
}

/**
 * Some adminForm fields use dotted keys (e.g. bodyText's `textStyle.size`) to
 * target a nested config object. `VizConfigForm` reads/writes its value map
 * with the literal key, so we flatten the on-disk nested shape into dotted
 * keys for editing and re-nest on save. Only schema-declared dotted parents
 * are expanded — json-valued fields (table.columns, keyValue.items) keep their
 * object payloads intact.
 */
function flatten(
  layer: Record<string, unknown>,
  schemaKeys: string[]
): Record<string, FormValue> {
  const dottedParents = new Set(
    schemaKeys.filter((k) => k.includes('.')).map((k) => k.split('.')[0])
  )
  const flat: Record<string, FormValue> = {}
  for (const [k, v] of Object.entries(layer)) {
    if (k === 'type') continue
    if (
      dottedParents.has(k) &&
      v != null &&
      typeof v === 'object' &&
      !Array.isArray(v)
    ) {
      for (const [ck, cv] of Object.entries(v as Record<string, unknown>)) {
        flat[`${k}.${ck}`] = cv as FormValue
      }
    } else {
      flat[k] = v as FormValue
    }
  }
  return flat
}

function unflatten(value: Record<string, FormValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) {
    const dot = k.indexOf('.')
    if (dot > 0) {
      const parent = k.slice(0, dot)
      const child = k.slice(dot + 1)
      const existing = out[parent]
      const obj =
        existing != null && typeof existing === 'object' && !Array.isArray(existing)
          ? (existing as Record<string, unknown>)
          : {}
      obj[child] = v
      out[parent] = obj
    } else {
      out[k] = v
    }
  }
  return out
}

export default function SlotFormModal({
  sectionLabel,
  layerType,
  initialLayer,
  saving,
  error,
  assetRefs,
  onApply,
  onEditAsYaml,
  onClose,
}: Props) {
  const vizModule = useMemo(() => getVizModule(layerType), [layerType])
  const schemaKeys = useMemo(
    () => vizModule?.adminForm?.(initialLayer as never)?.map((f) => f.key) ?? [],
    [vizModule, initialLayer]
  )
  const [value, setValue] = useState<Record<string, FormValue>>(() =>
    flatten(initialLayer, schemaKeys)
  )

  // Lock body scroll while open — same convention as ImageEditModal.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Esc closes. Catch on the modal root so it doesn't fight Rete's listeners.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  const hasForm = !!vizModule?.adminForm

  const modal = (
    <div
      onKeyDown={onKeyDown}
      tabIndex={-1}
      className="fixed inset-0 z-[100] bg-neutral-950 flex flex-col"
    >
      <header className="flex items-center gap-3 px-4 py-3 border-b border-white/10 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <button
          type="button"
          onClick={onClose}
          className="text-neutral-400 hover:text-white text-xl leading-none w-8 h-8 flex items-center justify-center"
          aria-label="Close"
        >
          ×
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-neutral-500">
            {vizModule?.label ?? layerType}
          </div>
          <div className="text-sm truncate">{sectionLabel}</div>
        </div>
        <button
          type="button"
          onClick={onEditAsYaml}
          className="text-xs px-3 py-2 rounded-lg text-neutral-300 hover:text-white border border-white/10 hover:bg-white/5"
        >
          Edit as YAML
        </button>
        {hasForm && (
          <button
            type="button"
            onClick={() => onApply(unflatten(value))}
            disabled={saving}
            className="bg-white text-neutral-950 rounded-lg px-4 py-2 text-sm font-medium active:bg-neutral-200 disabled:opacity-40 disabled:pointer-events-none"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </header>

      {error && (
        <div className="px-4 py-2 text-xs text-red-400 border-b border-white/10 bg-red-950/30">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="mx-auto max-w-xl">
          {hasForm ? (
            <VizConfigForm
              module={vizModule!}
              value={value}
              onChange={setValue}
              assetRefs={assetRefs}
            />
          ) : (
            <div className="text-sm text-neutral-400">
              No form schema for <span className="font-mono">{layerType}</span>.
              Use “Edit as YAML” to edit this slot.
            </div>
          )}
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(modal, document.body)
}
