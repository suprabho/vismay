'use client'

/**
 * Tab strip for an output group whose children are aspect-ratio variants
 * of the same render (currently just Share — 3:4 / 1:1 / 4:3). One iframe
 * mounts at a time; clicking a tab swaps which one. Visually anchored
 * directly above the active iframe.
 */
export interface OutputTab {
  id: string
  label: string
  /** Short dims string shown under the label, e.g. "1080 × 1440". */
  tag: string
  active: boolean
}

interface Props {
  tabs: OutputTab[]
  onSelect: (id: string) => void
}

export default function OutputTabBar({ tabs, onSelect }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: '#0e0e0e',
        border: '1px solid #262626',
        borderRadius: 10,
        padding: 8,
        display: 'flex',
        gap: 8,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          style={{
            flex: 1,
            background: t.active ? '#222' : 'transparent',
            color: t.active ? '#fff' : '#888',
            border: `1px solid ${t.active ? '#555' : 'transparent'}`,
            borderRadius: 6,
            cursor: 'pointer',
            padding: '12px 18px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            fontFamily: 'inherit',
            lineHeight: 1.1,
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 500 }}>{t.label}</span>
          <span
            style={{
              fontSize: 11,
              color: t.active ? '#888' : '#555',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {t.tag}
          </span>
        </button>
      ))}
    </div>
  )
}
