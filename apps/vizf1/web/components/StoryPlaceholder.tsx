'use client'

import { useState } from 'react'
import type { StoryVisual } from '@/lib/storyVisuals'

function darken(hex: string, amount: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  const ch = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount))
  return `rgb(${ch(1)}, ${ch(3)}, ${ch(5)})`
}

// OpenF1 serves the F1 CDN's 1-column (93px) crop. The cut-out fills most of
// a card that is ~400 CSS px tall (1000+ device px on a 3x phone), so ask for
// the 12-column rendition (1336px), then 4-column (432px), then the original.
// The untransformed master isn't a safe step: for some drivers it resolves to
// the CDN's fallback silhouette with a 200, so onError never fires.
// URLs look like `…/georus01.png.transform/1col/image.png` (note the dot).
const ONE_COL = '.transform/1col/'

function headshotCandidates(url: string): string[] {
  if (!url.includes(ONE_COL)) return [url]
  return [
    url.replace(ONE_COL, '.transform/12col/'),
    url.replace(ONE_COL, '.transform/4col/'),
    url,
  ]
}

function Headshot({ src, name, className }: { src: string; name: string; className: string }) {
  const [candidates] = useState(() => headshotCandidates(src))
  const [index, setIndex] = useState(0)
  if (index >= candidates.length) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={candidates[index]}
      alt={name}
      className={className}
      onError={() => setIndex((i) => i + 1)}
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
