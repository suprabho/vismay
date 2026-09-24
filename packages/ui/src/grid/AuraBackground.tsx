'use client'

import { useEffect, useRef, useState } from 'react'
import { auraEmbedUrl } from '@vismay/viz-engine'
import { AuraPoster } from './AuraPoster'

/**
 * Lazy-loaded iframe of the per-story aura visual served from
 * `aura.promad.design`. Sized to fill its containing block — caller is
 * responsible for setting position/dimensions and any overlay gradient.
 *
 * Outputs a `.bn-aura` wrapper div for backwards compatibility with the
 * grid CSS that styles overlays via `.bn-aura::after`.
 */
export function AuraBackground({
  slug,
  input = 'off',
  poster,
}: {
  slug: string
  /** Aura embed `input` mode. `mic` lets the aura react to playing audio. */
  input?: 'off' | 'mic'
  /**
   * Paint the scene's static capture still (at this size) beneath the live
   * iframe, so the card shows the aura cover immediately and keeps it if the
   * embed never loads.
   */
  poster?: { width: number; height: number }
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [show, setShow] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShow(true)
          obs.disconnect()
        }
      },
      { rootMargin: '300px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} className="bn-aura" aria-hidden>
      {poster && <AuraPoster slug={slug} width={poster.width} height={poster.height} />}
      {show && (
        <iframe
          title=""
          src={auraEmbedUrl(slug, { input })}
          loading="lazy"
          tabIndex={-1}
        />
      )}
    </div>
  )
}

export default AuraBackground
