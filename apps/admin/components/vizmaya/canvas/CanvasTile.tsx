'use client'

import { useMemo } from 'react'
import { resolveSlotsFlat } from '@vismay/viz-engine'
import type { ResolvedUnit } from '@vismay/viz-engine'

interface Props {
  unit: ResolvedUnit
  index: number
  focused: boolean
}

/**
 * Static tile placeholder. Shows section metadata only — no live render. The
 * shape is meant to evoke the eventual live preview: kind badge + headline +
 * module pills, with the body region intentionally blank so the difference
 * between this mock and a wired tile is obvious.
 */
export default function CanvasTile({ unit, index, focused }: Props) {
  const slots = useMemo(() => resolveSlotsFlat(unit.parentConfig), [unit])
  const fgTypes = uniqTypes(slots.foreground)
  const bgTypes = uniqTypes(slots.background)
  const kind = unit.parentConfig.kind ?? 'text'
  const heading = unit.heading || unit.paragraphs[0]?.replace(/\*+/g, '') || '(no heading)'
  const subheading = unit.subheading

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#111',
        border: `1px solid ${focused ? '#ffba49' : '#2a2a2a'}`,
        borderRadius: 8,
        boxShadow: focused ? '0 0 0 3px rgba(255, 186, 73, 0.18)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'system-ui, sans-serif',
        color: '#ccc',
      }}
    >
      {/* Header row — index + kind */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid #1f1f1f',
        }}
      >
        <span style={{ fontSize: 10, color: '#666', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          §{index + 1}
          {unit.parentConfig.id ? `  ·  ${unit.parentConfig.id}` : ''}
        </span>
        <Pill tone={KIND_TONE[kind]} text={kind} />
      </div>

      {/* Body — heading + subheading */}
      <div style={{ flex: 1, padding: '14px 14px 8px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: '#eee',
            lineHeight: 1.25,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {heading}
        </div>
        {subheading && (
          <div style={{ fontSize: 12, color: '#888', lineHeight: 1.35 }}>{subheading}</div>
        )}
        <div style={{ flex: 1 }} />
        {/* Body region — intentionally blank. This is where the live preview
            (or cached snapshot) will eventually paint. */}
        <div
          style={{
            border: '1px dashed #2a2a2a',
            borderRadius: 4,
            height: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#444',
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          preview · not wired
        </div>
      </div>

      {/* Footer — module pills */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '8px 14px 12px 14px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 9, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          fg
        </span>
        {fgTypes.length === 0 ? (
          <span style={{ fontSize: 10, color: '#444' }}>—</span>
        ) : (
          fgTypes.map((t) => <Pill key={`fg-${t}`} tone="fg" text={t} />)
        )}
        <span style={{ width: 12 }} />
        <span style={{ fontSize: 9, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          bg
        </span>
        {bgTypes.length === 0 ? (
          <span style={{ fontSize: 10, color: '#444' }}>—</span>
        ) : (
          bgTypes.map((t) => <Pill key={`bg-${t}`} tone="bg" text={t} />)
        )}
      </div>
    </div>
  )
}

function uniqTypes(layers: { type: string }[]): string[] {
  return Array.from(new Set(layers.map((l) => l.type)))
}

interface PillProps {
  tone: 'text' | 'hero' | 'stat' | 'fg' | 'bg'
  text: string
}

const TONES: Record<PillProps['tone'], { bg: string; fg: string }> = {
  text: { bg: '#1a2a3a', fg: '#7aa7d4' },
  hero: { bg: '#3a1a2a', fg: '#d47aa7' },
  stat: { bg: '#2a3a1a', fg: '#a7d47a' },
  fg: { bg: '#1f1f1f', fg: '#aaa' },
  bg: { bg: '#0f1a1f', fg: '#7ac4d4' },
}

const KIND_TONE: Record<string, PillProps['tone']> = {
  text: 'text',
  hero: 'hero',
  stat: 'stat',
}

function Pill({ tone, text }: PillProps) {
  const { bg, fg } = TONES[tone]
  return (
    <span
      style={{
        background: bg,
        color: fg,
        fontSize: 10,
        padding: '2px 7px',
        borderRadius: 999,
        letterSpacing: '0.03em',
      }}
    >
      {text}
    </span>
  )
}
