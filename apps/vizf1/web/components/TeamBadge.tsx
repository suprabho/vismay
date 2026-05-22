'use client'

import { useState } from 'react'
import { F1_BRAND, type ConstructorId } from '@vizf1/brand'

type Props = {
  constructorId: string | null
  name: string
  color?: string | null
  logoUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
  showName?: boolean
}

const SIZE = {
  sm: { box: 'h-6 w-6', text: 'text-[10px]', pad: 'p-0.5', px: 24 },
  md: { box: 'h-9 w-9', text: 'text-xs',    pad: 'p-1',   px: 36 },
  lg: { box: 'h-12 w-12', text: 'text-sm',  pad: 'p-1.5', px: 48 },
}

/**
 * Compact team badge: a square chip with either the constructor's logo (on a
 * light background) or a tinted abbreviation in the team's primary colour as
 * fallback. Used next to driver rows and on team pages.
 */
export function TeamBadge({
  constructorId,
  name,
  color,
  logoUrl,
  size = 'md',
  showName = false,
}: Props) {
  const [logoFailed, setLogoFailed] = useState(false)
  const showLogo = !!logoUrl && !logoFailed

  const abbr = name
    .replace(/[^A-Za-z ]/g, '')
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 3) || (constructorId ?? '?').slice(0, 3).toUpperCase()

  const resolved =
    color ?? F1_BRAND.constructors[constructorId as ConstructorId] ?? F1_BRAND.colors.muted
  const { box, text, pad, px } = SIZE[size]
  return (
    <span className="inline-flex items-center gap-2 align-middle">
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-md font-semibold tracking-wide ${box} ${showLogo ? pad : ''} ${text}`}
        style={
          showLogo
            ? { backgroundColor: 'rgba(255,255,255,0.95)' }
            : { backgroundColor: `${resolved}22`, color: resolved }
        }
      >
        {showLogo ? (
          <img
            src={logoUrl!}
            alt={name}
            width={px}
            height={px}
            loading="lazy"
            onError={() => setLogoFailed(true)}
            className="h-full w-full object-contain"
          />
        ) : (
          abbr
        )}
      </span>
      {showName ? <span className="truncate text-text">{name}</span> : null}
    </span>
  )
}
