'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Lazy-loaded iframe of the per-story aura visual served from
 * `aura.promad.design`. Sized to fill its containing block — caller is
 * responsible for setting position/dimensions and any overlay gradient.
 *
 * Outputs a `.bn-aura` wrapper div for backwards compatibility with the
 * home-page CSS that styles overlays via `.bn-aura::after`.
 */
export default function AuraBackground({
  slug,
  input = 'off',
}: {
  slug: string
  /** Aura embed `input` mode. `mic` lets the aura react to playing audio. */
  input?: 'off' | 'mic'
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
      {show && (
        <iframe
          title=""
          src={`https://aura.promad.design/embed/${slug}?hideText=true&hideIcons=true&input=${input}&theme=light`}
          loading="lazy"
          tabIndex={-1}
        />
      )}
    </div>
  )
}
