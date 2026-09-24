'use client'

import { useEffect, useState } from 'react'
import { CHAPTERS } from './editionUtils'

/**
 * Sticky chapter navigation with scroll-spy. The list is plain anchors so
 * it works without JS; the observer only moves the active underline.
 */
export default function ChapterNav() {
  const [active, setActive] = useState(CHAPTERS[0].id)

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const sections = CHAPTERS.map((c) => document.getElementById(c.id)).filter((el): el is HTMLElement => !!el)
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: '-35% 0px -55% 0px' },
    )
    sections.forEach((s) => io.observe(s))
    return () => io.disconnect()
  }, [])

  return (
    <div className="chapters">
      <ul>
        {CHAPTERS.map((c) => (
          <li key={c.id}>
            <a href={`#${c.id}`} className={active === c.id ? 'active' : undefined}>
              <span className="n">{c.n}</span>
              {c.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
