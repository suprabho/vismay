'use client'

import { useState } from 'react'
import type { StoryVisual } from '@/lib/storyVisuals'

function darken(hex: string, amount: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  const ch = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount))
  return `rgb(${ch(1)}, ${ch(3)}, ${ch(5)})`
}

// OpenF1 serves the F1 CDN's 1-column (~93px) crop; the 4-column rendition of
// the same cut-out is sharp at card size. Fall back to the original on error.
function largeHeadshot(url: string): string {
  return url.replace('/transform/1col/', '/transform/4col/')
}

function Headshot({ src, name, className }: { src: string; name: string; className: string }) {
  const [url, setUrl] = useState(() => largeHeadshot(src))
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      className={className}
      onError={() => (url !== src ? setUrl(src) : setFailed(true))}
    />
  )
}

/**
 * Artwork for a story whose article has no image — mirrors Footshorts' crest
 * placeholder: the team colour fills the tile, the race flag takes the
 * opposite diagonal (like Footshorts' two-club split), the constructor mark
 * sits on the team side and the driver's cut-out headshot stands in front.
 *
 * `variant="full"` (story viewer) lifts the headshot clear of the bottom text
 * block; `card` anchors it to the bottom edge the card fades out over.
 */
export function StoryPlaceholder({
  visual,
  variant = 'card',
}: {
  visual: StoryVisual | null
  variant?: 'card' | 'full'
}) {
  if (!visual) {
    return <div className="absolute inset-0 bg-gradient-to-br from-surface to-bg" aria-hidden />
  }
  const { driver, team, flag } = visual
  const color = team?.color ?? null
  const background = color
    ? `linear-gradient(135deg, ${color} 0%, ${darken(color, 0.55)} 100%)`
    : 'linear-gradient(135deg, var(--color-surface) 0%, var(--color-bg) 100%)'
  // With a team colour to share the tile, the flag takes the right-hand
  // diagonal; on its own it fills the whole tile.
  const flagClip = color ? 'polygon(62% 0, 100% 0, 100% 100%, 38% 100%)' : undefined
  const logoAlone = !driver

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background }} aria-hidden>
      {flag ? (
        <div className="absolute inset-0" style={{ clipPath: flagClip }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={flag.url} alt="" className="h-full w-full object-cover" />
          {/* Knock the flag back so the headshot and mark read in front of it. */}
          <div className="absolute inset-0 bg-black/35" />
        </div>
      ) : null}

      {team?.logoUrl ? (
        // The bundled marks are white glyphs, so they sit on the team colour.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={team.logoUrl}
          alt=""
          className={
            logoAlone
              ? `absolute left-1/2 ${variant === 'full' ? 'top-[32%]' : 'top-[40%]'} h-[28%] max-h-40 w-auto -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-lg`
              : 'absolute left-[8%] top-[18%] h-[18%] max-h-24 w-auto object-contain opacity-90 drop-shadow-lg'
          }
        />
      ) : null}

      {driver ? (
        <Headshot
          key={driver.headshotUrl}
          src={driver.headshotUrl}
          name={driver.name}
          className={`absolute left-1/2 w-auto max-w-[80%] -translate-x-1/2 object-contain object-bottom drop-shadow-2xl ${
            variant === 'full' ? 'bottom-[38%] h-[48%]' : 'bottom-0 h-[88%]'
          }`}
        />
      ) : null}
    </div>
  )
}
