'use client'

/**
 * Bottom slide rail for the canvas — the story's section order, made
 * visible and editable after compose has materialized.
 *
 * One chip per section (in config `sections[]` order — which IS the slide
 * order): click to jump the canvas to that section, ◀ / ▶ on the active
 * chip to move it one slot left/right (the caller rewrites the config and
 * remaps the positional sidecars), and a trailing ＋ chip to add a new
 * section right after the active one.
 *
 * Deliberately button-stepped rather than drag-and-drop: no dnd library is
 * installed and every other reorder surface in the repo (compose outline,
 * YAML cards) is arrow-based, so the interaction language stays consistent.
 *
 * Visual language matches the rest of the canvas: dark floating panel,
 * 11px system type, no animations.
 */

import { useEffect, useRef } from 'react'

export interface RailSection {
  /** Stable-ish key for React — section id, falling back to index. */
  key: string
  /** Chip text: the section id (or heading fallback). */
  label: string
  /** Config `kind`, shown dimmed when present (hero / cover / stat / …). */
  kind?: string
}

export function SectionRail({
  sections,
  active,
  busy,
  error,
  onSelect,
  onMove,
  onAdd,
}: {
  sections: RailSection[]
  active: number
  busy: boolean
  error: string | null
  onSelect: (index: number) => void
  /** Move the section at `from` to `to` (only ever ±1 from the chips). */
  onMove: (from: number, to: number) => void
  onAdd: () => void
}) {
  const activeChipRef = useRef<HTMLDivElement>(null)
  // Keep the active chip visible as the user paginates with ← / → — the
  // strip scrolls horizontally once a story outgrows the viewport.
  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])

  const moveBtn = (dir: -1 | 1) => {
    const to = active + dir
    const disabled = busy || to < 0 || to >= sections.length
    return (
      <button
        onClick={() => onMove(active, to)}
        disabled={disabled}
        title={dir === -1 ? 'Move this section one slot earlier' : 'Move this section one slot later'}
        style={{
          background: 'transparent',
          color: disabled ? '#444' : '#7dd3fc',
          border: 'none',
          padding: '0 3px',
          fontSize: 11,
          lineHeight: 1,
          cursor: disabled ? 'default' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {dir === -1 ? '◀' : '▶'}
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 'calc(100vw - 32px)',
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        pointerEvents: 'none',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {error && (
        <div
          style={{
            pointerEvents: 'auto',
            background: '#2a1212',
            border: '1px solid #7f2a2a',
            color: '#f0a0a0',
            borderRadius: 5,
            padding: '3px 10px',
            fontSize: 11,
            maxWidth: 480,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {error}
        </div>
      )}
      <div
        style={{
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          maxWidth: '100%',
          overflowX: 'auto',
          background: 'rgba(20,20,20,0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid #2a2a2a',
          borderRadius: 8,
          opacity: busy ? 0.6 : 1,
        }}
      >
        {sections.map((s, i) => {
          const isActive = i === active
          return (
            <div
              key={s.key}
              ref={isActive ? activeChipRef : undefined}
              onClick={isActive || busy ? undefined : () => onSelect(i)}
              title={s.kind ? `${s.label} · ${s.kind}` : s.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                flex: 'none',
                padding: '3px 8px',
                borderRadius: 5,
                border: `1px solid ${isActive ? '#5aa9d8' : '#2a2a2a'}`,
                background: isActive ? '#10303f' : 'transparent',
                color: isActive ? '#cde9f7' : '#999',
                fontSize: 11,
                lineHeight: '16px',
                cursor: isActive || busy ? 'default' : 'pointer',
                userSelect: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {isActive && moveBtn(-1)}
              <span style={{ color: isActive ? '#7dd3fc' : '#666' }}>{i + 1}</span>
              <span
                style={{
                  maxWidth: 120,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {s.label}
              </span>
              {s.kind && <span style={{ color: '#666' }}>· {s.kind}</span>}
              {isActive && moveBtn(1)}
            </div>
          )
        })}
        <button
          onClick={onAdd}
          disabled={busy}
          title="Add a new section after the current one"
          style={{
            flex: 'none',
            background: 'transparent',
            color: '#c79bd8',
            border: '1px dashed #5a2a8f',
            borderRadius: 5,
            padding: '3px 9px',
            fontSize: 11,
            lineHeight: '16px',
            cursor: busy ? 'default' : 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}
        >
          ＋ Section
        </button>
      </div>
    </div>
  )
}
