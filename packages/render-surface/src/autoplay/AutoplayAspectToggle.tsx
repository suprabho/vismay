'use client'

export type AutoplayRatio = '9:16' | '16:9'

interface Props {
  value: AutoplayRatio
  onChange: (ratio: AutoplayRatio) => void
}

const RATIOS: { label: string; value: AutoplayRatio; desc: string }[] = [
  { label: '9:16', value: '9:16', desc: 'Vertical' },
  { label: '16:9', value: '16:9', desc: 'Widescreen' },
]

export default function AutoplayAspectToggle({ value, onChange }: Props) {
  return (
    <div
      className="flex gap-1 rounded-lg p-1"
      style={{ background: 'rgb(var(--color-bg-rgb) / 0.5)' }}
    >
      {RATIOS.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          className="px-3 py-1.5 rounded-md text-xs font-[family-name:var(--font-mono)] uppercase tracking-wider transition-colors"
          style={{
            background: value === r.value ? 'var(--color-accent)' : 'transparent',
            color: value === r.value ? 'var(--color-bg)' : 'var(--color-muted)',
          }}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}
