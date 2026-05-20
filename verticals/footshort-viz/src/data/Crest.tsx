'use client'

import type { CSSProperties } from 'react'
import { findTeam } from './teams'

/**
 * Inline-SVG crest placeholder. Renders a circular badge with the team's
 * primary color, a secondary stripe, and the team's monogram. Used by every
 * fs:match-card layout so cards look right even when no external crest URL
 * is supplied — and so social-share renders are deterministic.
 *
 * When a `crestUrl` is provided (YAML override) the component renders that
 * image instead, falling back to the placeholder on error.
 */
interface Props {
  team: string
  size?: number
  crestUrl?: string
  className?: string
  style?: CSSProperties
}

export function Crest({ team, size = 48, crestUrl, className, style }: Props) {
  if (crestUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={crestUrl}
        alt=""
        width={size}
        height={size}
        className={className}
        style={{ objectFit: 'contain', ...style }}
      />
    )
  }
  const entry = findTeam(team)
  const color = entry?.color ?? '#404040'
  const secondary = entry?.secondary ?? '#FFFFFF'
  const monogram = entry?.monogram ?? team.slice(0, 3).toUpperCase()
  const fontSize = Math.round(size * 0.32)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      style={style}
      aria-label={entry?.name ?? team}
      role="img"
    >
      <defs>
        <radialGradient id={`crest-bg-${monogram}`} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.85" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={`url(#crest-bg-${monogram})`} stroke={secondary} strokeWidth="1.5" />
      <path d="M2 32 a30 30 0 0 0 60 0" fill={secondary} fillOpacity="0.18" />
      <text
        x="32"
        y="32"
        textAnchor="middle"
        dominantBaseline="central"
        fill={secondary}
        fontFamily="var(--font-mono, ui-monospace, SFMono-Regular, monospace)"
        fontSize={fontSize}
        fontWeight="700"
        letterSpacing="0.05em"
      >
        {monogram}
      </text>
    </svg>
  )
}
