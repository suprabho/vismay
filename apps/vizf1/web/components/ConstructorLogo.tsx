'use client'

import { useState } from 'react'
import { TeamBadge } from '@/components/TeamBadge'

type Props = {
  constructorId: string | null
  name: string
  color?: string | null
  logoUrl?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const SIZE = {
  sm: { box: 'h-12 w-12', px: 48 },
  md: { box: 'h-16 w-16', px: 64 },
  lg: { box: 'h-24 w-24', px: 96 },
  xl: { box: 'h-32 w-32', px: 128 },
}

/**
 * Large standalone constructor logo for page headers and high-emphasis spots.
 * Renders on a transparent background (no chip) so the artwork stands on its
 * own. Falls back to a TeamBadge at size lg when the URL is missing or fails
 * to load.
 */
export function ConstructorLogo({ constructorId, name, color, logoUrl, size = 'xl' }: Props) {
  const [logoFailed, setLogoFailed] = useState(false)

  if (!logoUrl || logoFailed) {
    return <TeamBadge constructorId={constructorId} name={name} color={color} size="lg" />
  }

  const { box, px } = SIZE[size]
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${box}`}>
      <img
        src={logoUrl}
        alt={name}
        width={px}
        height={px}
        loading="lazy"
        onError={() => setLogoFailed(true)}
        className="h-full w-full object-contain"
      />
    </span>
  )
}
