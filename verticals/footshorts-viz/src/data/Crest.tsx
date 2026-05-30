'use client'

import { useState, type CSSProperties } from 'react'
import { findTeam, slugify } from './teams'

/**
 * Team crest with a deterministic fallback chain:
 *   1. explicit `crestUrl` prop (per-fixture YAML override), else
 *   2. the bundled palette crest (football-data.org, via findTeam), else
 *   3. an inline-SVG monogram badge.
 *
 * If the resolved image fails to load (blocked host, 404, wrong id) the
 * `onError` handler drops to the monogram, so a crest is never a broken image.
 */
interface Props {
  team: string
  size?: number
  crestUrl?: string
  className?: string
  style?: CSSProperties
}

export function Crest({ team, size = 48, crestUrl, className, style }: Props) {
  const entry = findTeam(team)
  const resolvedUrl = crestUrl ?? entry?.crest
  const [imgFailed, setImgFailed] = useState(false)

  if (resolvedUrl && !imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolvedUrl}
        alt={entry?.name ?? team}
        width={size}
        height={size}
        className={className}
        style={{ objectFit: 'contain', ...style }}
        onError={() => setImgFailed(true)}
      />
    )
  }

  const color = entry?.color ?? '#404040'
  const secondary = entry?.secondary ?? '#FFFFFF'
  const monogram = entry?.monogram ?? team.slice(0, 3).toUpperCase()
  const fontSize = Math.round(size * 0.32)
  // Key the gradient id off the team identity (not the monogram) so two clubs
  // that share a monogram don't collide on a single shared <defs> id.
  const gradId = `crest-bg-${slugify(entry?.name ?? team)}`
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
        <radialGradient id={gradId} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.85" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={`url(#${gradId})`} stroke={secondary} strokeWidth="1.5" />
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
