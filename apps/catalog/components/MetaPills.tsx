import type { VizSlot } from '@vismay/viz-engine'

interface Props {
  slots: readonly VizSlot[]
  mountingMode?: string
}

export default function MetaPills({ slots, mountingMode }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {slots.map((slot) => (
        <span
          key={slot}
          className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-[color:var(--color-line)] text-[color:var(--color-muted)]"
        >
          {slot}
        </span>
      ))}
      {mountingMode && mountingMode !== 'per-unit' && (
        <span className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-[color:var(--color-line)] text-[color:var(--color-muted)]">
          {mountingMode}
        </span>
      )}
    </div>
  )
}
