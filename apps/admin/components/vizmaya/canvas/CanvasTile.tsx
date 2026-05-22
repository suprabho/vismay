'use client'

import { useMemo } from 'react'
import { resolveSlotsFlat } from '@vismay/viz-engine'
import type {
  MapOverrideConfig,
  ResolvedUnit,
  StoryDefaults,
} from '@vismay/viz-engine'
import SectionPreview from './SectionPreview'

interface Props {
  slug: string
  unit: ResolvedUnit
  index: number
  focused: boolean
  accessToken: string
  defaults: StoryDefaults
  mapOverrides: MapOverrideConfig | null | undefined
}

/**
 * Canvas tile: chrome around a swappable body region.
 *
 * The chrome (index pill, kind badge, heading line, fg/bg module pills) is
 * always the same so the layout doesn't shift between focused and unfocused
 * states. The body is the only thing that changes:
 *   - focused   → <SectionPreview mode="live"> — real engine render, tile-scoped
 *   - unfocused → dashed placeholder — stands in for the eventual cached snapshot
 *
 * Mounting live render only for the focused tile keeps the WebGL context count
 * bounded. Sections with map backgrounds otherwise blow the per-page Mapbox
 * cap once the canvas grows past a handful of sections.
 */
export default function CanvasTile({
  slug,
  unit,
  index,
  focused,
  accessToken,
  defaults,
  mapOverrides,
}: Props) {
  const slots = useMemo(() => resolveSlotsFlat(unit.parentConfig), [unit])
  const fgTypes = uniqTypes(slots.foreground)
  const bgTypes = uniqTypes(slots.background)
  const kind = unit.parentConfig.kind ?? 'text'
  const heading = unit.heading || unit.paragraphs[0]?.replace(/\*+/g, '') || '(no heading)'

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
      {/* Chrome header — index, id, kind, heading. Always visible so the
          tile stays identifiable regardless of body state. */}
      <div
        style={{
          padding: '8px 12px 10px 12px',
          borderBottom: '1px solid #1f1f1f',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontSize: 10,
              color: '#666',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            §{index + 1}
            {unit.parentConfig.id ? `  ·  ${unit.parentConfig.id}` : ''}
          </span>
          <Pill tone={KIND_TONE[kind]} text={kind} />
        </div>
        <div
          style={{
            fontSize: 13,
            color: focused ? '#888' : '#ddd',
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {heading}
        </div>
      </div>

      {/* Body — live preview when focused, placeholder otherwise. */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {focused ? (
          <SectionPreview
            slug={slug}
            unit={unit}
            accessToken={accessToken}
            defaults={defaults}
            mapOverrides={mapOverrides}
            mode="live"
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 8,
              border: '1px dashed #2a2a2a',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#444',
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            snapshot · pending
          </div>
        )}
      </div>

      {/* Chrome footer — module pills */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '8px 12px 10px 12px',
          borderTop: '1px solid #1f1f1f',
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
