'use client'

import { F1_BRAND, type ConstructorId } from '@vizf1/brand'

type Props = {
  constructorId: string | null
  name: string
  color?: string | null
  size?: 'sm' | 'md' | 'lg'
  showName?: boolean
}

const SIZE = {
  sm: { box: 'h-6 w-6', text: 'text-[10px]' },
  md: { box: 'h-9 w-9', text: 'text-xs' },
  lg: { box: 'h-12 w-12', text: 'text-sm' },
}

/**
 * Compact team badge: a square chip in the constructor's primary colour with
 * a three-letter abbreviation. Renders next to driver rows and on team pages.
 *
 * We don't render full team logos — most are trademarked and changing every
 * year. The colour + abbreviation gives a reliably recognisable identity.
 */
export function TeamBadge({ constructorId, name, color, size = 'md', showName = false }: Props) {
  const abbr = name
    .replace(/[^A-Za-z ]/g, '')
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 3) || (constructorId ?? '?').slice(0, 3).toUpperCase()

  const resolved =
    color ?? F1_BRAND.constructors[constructorId as ConstructorId] ?? F1_BRAND.colors.muted
  const { box, text } = SIZE[size]
  return (
    <span className="inline-flex items-center gap-2 align-middle">
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-md font-semibold tracking-wide ${box} ${text}`}
        style={{ backgroundColor: `${resolved}22`, color: resolved }}
      >
        {abbr}
      </span>
      {showName ? <span className="truncate text-text">{name}</span> : null}
    </span>
  )
}
