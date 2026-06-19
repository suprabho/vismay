'use client'

import { useCallback } from 'react'
import type { AdminFormField, VizModule } from '@vismay/viz-engine'
import { getPickerEditor } from './pickers/registry'

/**
 * Renders a viz module's adminForm() schema as a stack of input rows. Authors
 * fill values; the parent receives an `onChange` with the updated config.
 *
 * Hoisted to `@vismay/viz-admin` (from apps/admin) so the footshorts + vizmaya
 * composers share one per-layer config form. The only behavioural addition over
 * the original is the `picker` field kind — a domain selector resolved from the
 * host picker registry — plus the `ctx` it threads to those pickers. The form
 * itself stays domain-free.
 */

type FormValue = string | number | boolean | object | null | undefined

interface VizConfigFormProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  module: VizModule<any>
  value: Record<string, FormValue>
  onChange: (next: Record<string, FormValue>) => void
  /** Optional bucket of already-uploaded asset refs (`assets://<slug>/<file>`) for the asset picker. */
  assetRefs?: string[]
  /** Per-render host context passed through to `picker` field editors (loaded
   *  domain data, slug, asset refs, …). The composer shell threads its `ctx` here;
   *  existing callers omit it and are unaffected. */
  ctx?: unknown
}

export default function VizConfigForm({ module, value, onChange, assetRefs = [], ctx }: VizConfigFormProps) {
  const fields = module.adminForm?.(value as never) ?? []

  const set = useCallback(
    (key: string, v: FormValue) => {
      const next = { ...value }
      if (v === '' || v === undefined || v === null) {
        delete next[key]
      } else {
        next[key] = v
      }
      onChange(next)
    },
    [onChange, value]
  )

  if (fields.length === 0) {
    return (
      <div className="text-sm text-[color:var(--color-muted)]">
        No form schema for this viz type. Use the raw YAML editor.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => (
        <Field
          key={field.key}
          field={field}
          value={value[field.key]}
          siblings={value}
          onChange={(v) => set(field.key, v)}
          assetRefs={assetRefs}
          ctx={ctx}
        />
      ))}
    </div>
  )
}

function Field({
  field,
  value,
  siblings,
  onChange,
  assetRefs,
  ctx,
}: {
  field: AdminFormField
  value: FormValue
  siblings: Record<string, FormValue>
  onChange: (v: FormValue) => void
  assetRefs: string[]
  ctx?: unknown
}) {
  const labelClass = 'text-xs font-mono uppercase tracking-wider text-[color:var(--color-muted)]'
  const inputBase =
    'w-full rounded border border-[color:var(--color-line)] bg-transparent px-2 py-1.5 text-sm text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)]'

  switch (field.kind) {
    case 'text':
    case 'theme-token':
      return (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>
            {field.label}
            {field.kind === 'text' && field.required ? ' *' : ''}
          </span>
          <input
            type="text"
            value={typeof value === 'string' ? value : ''}
            placeholder={field.kind === 'text' ? field.placeholder : '$accent / $bg / …'}
            onChange={(e) => onChange(e.target.value)}
            className={inputBase}
          />
        </label>
      )

    case 'number':
      return (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{field.label}</span>
          <input
            type="number"
            value={typeof value === 'number' ? value : ''}
            min={field.min}
            max={field.max}
            step={field.step ?? 'any'}
            onChange={(e) => {
              const n = e.target.value === '' ? undefined : Number(e.target.value)
              onChange(Number.isFinite(n) ? n : undefined)
            }}
            className={inputBase}
          />
        </label>
      )

    case 'boolean':
      return (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked || undefined)}
          />
          <span className="text-sm text-[color:var(--color-text)]">{field.label}</span>
        </label>
      )

    case 'select':
      return (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{field.label}</span>
          <select
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value || undefined)}
            className={inputBase}
          >
            <option value="">(default)</option>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )

    case 'asset':
      return (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>
            {field.label}
            {field.required ? ' *' : ''}
          </span>
          {assetRefs.length > 0 ? (
            <select
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => onChange(e.target.value || undefined)}
              className={inputBase}
            >
              <option value="">(pick from uploaded assets)</option>
              {assetRefs.map((ref) => (
                <option key={ref} value={ref}>
                  {ref}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={typeof value === 'string' ? value : ''}
              placeholder={`assets://<slug>/<file>  or  https://…  (accept: ${field.accept.join(', ')})`}
              onChange={(e) => onChange(e.target.value)}
              className={inputBase}
            />
          )}
        </label>
      )

    case 'json':
      return (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{field.label}</span>
          <textarea
            value={
              value == null
                ? ''
                : typeof value === 'string'
                  ? value
                  : JSON.stringify(value, null, 2)
            }
            placeholder={field.placeholder ?? '{ }'}
            onChange={(e) => {
              const text = e.target.value
              if (text.trim() === '') {
                onChange(undefined)
                return
              }
              try {
                onChange(JSON.parse(text))
              } catch {
                // Stash the raw text — user is mid-edit. The Compose panel's
                // YAML preview will display it as a fragile string and the
                // parser will surface a YAML-friendly error on save.
                onChange(text)
              }
            }}
            rows={4}
            className={`${inputBase} font-mono text-xs`}
          />
        </label>
      )

    case 'picker': {
      const Editor = getPickerEditor(field.pickerId)
      if (!Editor) {
        return (
          <label className="flex flex-col gap-1">
            <span className={labelClass}>
              {field.label}
              {field.required ? ' *' : ''}
            </span>
            <span className="text-xs italic text-[color:var(--color-muted)]">
              No picker registered for “{field.pickerId}”.
            </span>
          </label>
        )
      }
      return (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>
            {field.label}
            {field.required ? ' *' : ''}
          </span>
          <Editor
            value={value}
            onChange={(v) => onChange(v as FormValue)}
            siblings={siblings as Record<string, unknown>}
            ctx={ctx}
          />
        </label>
      )
    }

    default:
      return null
  }
}
