'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import Link from 'next/link'
import { StoryShell as BaseStoryShell } from '@vismay/story-reader'
import VizmayaLogo from '@/components/VizmayaLogo'
import {
  trackStoryViewed,
  trackStorySectionViewed,
  trackStoryCompleted,
} from '@/lib/analytics'

// Depth milestones (% through the story) reported as `story_section_viewed`.
// 100% is reported separately as `story_completed`, so it isn't listed here.
const DEPTH_MILESTONES = [25, 50, 75] as const

// next/link-backed home link so the in-app reader keeps client-side nav +
// prefetch. The generic shell defaults to a plain anchor (no Next dependency).
function NextHomeLink({
  href,
  children,
  ...rest
}: {
  href: string
  className?: string
  'aria-label'?: string
  children: ReactNode
}) {
  return (
    <Link href={href} {...rest}>
      {children}
    </Link>
  )
}

/**
 * Vizmaya binding of the generic story shell (`@vismay/story-reader`): injects
 * the Vizmaya logo and a next/link home link, and maps the shell's
 * `onSectionChange` signal onto Amplitude reading-depth events. Every vizmaya
 * route imports the reader through this adapter, so all of them get depth
 * tracking for free — and because the base shell only fires `onSectionChange`
 * on genuine scroll reads, autoplay/capture/embed renders emit nothing.
 */
export default function StoryShell(props: ComponentProps<typeof BaseStoryShell>) {
  const { slug, format } = props

  // Per-read analytics state. The App Router remounts the page tree on a slug
  // change, so a fresh story starts clean; the reset effect also guards an
  // in-place slug swap. `viewed`/`completed` fire once; `milestones` dedupes.
  const fired = useRef({
    viewed: false,
    milestones: new Set<number>(),
    completed: false,
  })
  useEffect(() => {
    fired.current = { viewed: false, milestones: new Set<number>(), completed: false }
  }, [slug])

  const handleSectionChange = useCallback(
    (activeIndex: number, totalSections: number) => {
      if (!slug || totalSections <= 0) return
      const st = fired.current

      if (!st.viewed) {
        st.viewed = true
        trackStoryViewed(slug, { format, totalSections })
      }

      const pct =
        totalSections > 1 ? (activeIndex / (totalSections - 1)) * 100 : 100
      for (const m of DEPTH_MILESTONES) {
        if (pct >= m && !st.milestones.has(m)) {
          st.milestones.add(m)
          trackStorySectionViewed(slug, m, { sectionIndex: activeIndex, totalSections })
        }
      }

      if (activeIndex >= totalSections - 1 && !st.completed) {
        st.completed = true
        trackStoryCompleted(slug, { totalSections })
      }
    },
    [slug, format]
  )

  return (
    <BaseStoryShell
      {...props}
      LogoComponent={VizmayaLogo}
      LinkComponent={NextHomeLink}
      onSectionChange={handleSectionChange}
    />
  )
}
