'use client'

import type { CSSProperties, ReactNode } from 'react'
import type { FsBackgroundConfig } from '../modules/shared/background'

/**
 * Full-bleed background frame shared by every `fs:*` module. Paints an optional
 * image — with `fit` / `dim` / `blur` — behind `children`, which sit on top and
 * fill the frame.
 *
 * Strictly opt-in: with no `backgroundImage` the frame is a transparent
 * passthrough (just a `position: relative; 100%×100%` box), so a module renders
 * exactly as it did before the feature existed.
 *
 * The frame fills its parent (the viz layer area), so the image always covers the
 * module's full footprint regardless of how the content sizes itself.
 */
export function FsFrame({
  backgroundImage,
  backgroundFit = 'cover',
  backgroundDim = 0,
  backgroundBlur = 0,
  children,
}: FsBackgroundConfig & { children: ReactNode }) {
  const frame: CSSProperties = { position: 'relative', width: '100%', height: '100%' }

  if (!backgroundImage) {
    return <div style={frame}>{children}</div>
  }

  const dim = Math.max(0, Math.min(1, backgroundDim))
  const blur = Math.max(0, backgroundBlur)
  const imageLayer: CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundImage: `url(${backgroundImage})`,
    backgroundSize: backgroundFit,
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    // Blur feathers transparent edges inward; scale up a touch so the frame stays
    // fully covered instead of showing a soft border.
    ...(blur > 0 ? { filter: `blur(${blur}px)`, transform: 'scale(1.06)' } : {}),
  }

  return (
    <div style={{ ...frame, overflow: 'hidden' }}>
      <div aria-hidden style={imageLayer} />
      {dim > 0 && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${dim})` }} />
      )}
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>{children}</div>
    </div>
  )
}
