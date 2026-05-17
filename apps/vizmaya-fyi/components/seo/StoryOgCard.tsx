import type { CSSProperties } from 'react'

interface StoryOgCardProps {
  title: string
  subtitle: string
  byline: string
  date: string
  colors: {
    background: string
    text: string
    accent: string
    accent2: string
    surface: string
    muted: string
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function StoryOgCard({ title, subtitle, byline, date, colors }: StoryOgCardProps) {
  const root: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '72px 80px',
    background: `linear-gradient(135deg, ${colors.background} 0%, ${colors.surface} 100%)`,
    color: colors.text,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  }
  return (
    <div style={root}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 28, letterSpacing: '0.18em', textTransform: 'uppercase', color: colors.accent }}>
        <div style={{ width: 14, height: 14, borderRadius: 999, background: colors.accent }} />
        <div>vizmaya</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 1040 }}>
        <div
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: 84,
            lineHeight: 1.05,
            fontWeight: 600,
            color: colors.text,
            letterSpacing: '-0.015em',
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 32, lineHeight: 1.35, color: colors.muted, maxWidth: 980 }}>
          {subtitle}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 24,
          color: colors.muted,
          paddingTop: 24,
          borderTop: `1px solid ${colors.accent2}`,
        }}
      >
        <div style={{ color: colors.text }}>{byline}</div>
        <div>{formatDate(date)}</div>
      </div>
    </div>
  )
}
