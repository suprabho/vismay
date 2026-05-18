'use client'

import type { AdminFormField } from '@vismay/viz-engine'

type FieldValue = unknown

interface Props {
  fields: AdminFormField[]
  values?: Record<string, FieldValue>
}

/**
 * Read-only renderer for a viz module's `adminForm()` schema. Mirrors
 * VizConfigForm in `apps/vizmaya-fyi/components/admin/VizConfigForm.tsx`
 * but is non-editable and lives here so the catalog app (and any future
 * documentation surface) can reuse the field display without duplicating
 * the switch on `field.kind`.
 */
export default function AdminFormFields({ fields, values = {} }: Props) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-[color:var(--color-muted)]">
        This module does not declare an admin form schema.
      </p>
    )
  }

  return (
    <dl className="flex flex-col gap-3">
      {fields.map((field) => (
        <Row key={field.key} field={field} value={values[field.key]} />
      ))}
    </dl>
  )
}

function Row({ field, value }: { field: AdminFormField; value: FieldValue }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 items-baseline">
      <dt className="text-xs font-mono uppercase tracking-wider text-[color:var(--color-muted)]">
        {field.label}
        {isRequired(field) ? ' *' : ''}
        <KindHint field={field} />
      </dt>
      <dd className="text-sm text-[color:var(--color-text)] min-w-0">
        <ValueDisplay field={field} value={value} />
      </dd>
    </div>
  )
}

function isRequired(field: AdminFormField): boolean {
  if (field.kind === 'text' || field.kind === 'asset') return field.required === true
  return false
}

function KindHint({ field }: { field: AdminFormField }) {
  return (
    <span className="ml-2 normal-case font-mono text-[10px] text-[color:var(--color-muted)] opacity-70">
      {field.kind}
    </span>
  )
}

function ValueDisplay({ field, value }: { field: AdminFormField; value: FieldValue }) {
  if (value === undefined || value === null || value === '') {
    return <span className="text-[color:var(--color-muted)] italic">(unset)</span>
  }

  switch (field.kind) {
    case 'text':
    case 'theme-token':
      return <code className="font-mono text-xs break-all">{String(value)}</code>

    case 'number':
      return <code className="font-mono text-xs">{String(value)}</code>

    case 'boolean':
      return <code className="font-mono text-xs">{value === true ? 'true' : 'false'}</code>

    case 'select': {
      const opt = field.options.find((o) => o.value === value)
      return (
        <span>
          {opt ? opt.label : String(value)}{' '}
          <code className="font-mono text-[11px] text-[color:var(--color-muted)]">
            ({String(value)})
          </code>
        </span>
      )
    }

    case 'asset':
      return <code className="font-mono text-xs break-all">{String(value)}</code>

    case 'json':
      return (
        <pre className="font-mono text-[11px] whitespace-pre-wrap break-all rounded border border-[color:var(--color-line)] bg-black/20 px-2 py-1.5">
          {JSON.stringify(value, null, 2)}
        </pre>
      )

    default:
      return <span>{String(value)}</span>
  }
}
