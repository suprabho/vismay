'use client'

export type AspectRatio = '1:1' | '3:4' | '4:3'

interface Props {
  value: AspectRatio
  onChange: (ratio: AspectRatio) => void
}

const RATIOS: { label: string; value: AspectRatio; desc: string }[] = [
  { label: '1:1', value: '1:1', desc: 'Square' },
  { label: '3:4', value: '3:4', desc: 'Portrait' },
  { label: '4:3', value: '4:3', desc: 'Landscape' },
]

export default function AspectRatioToggle({ value, onChange }: Props) {
  return (
    <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--color-surface)' }}>
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
