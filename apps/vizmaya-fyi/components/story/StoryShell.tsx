'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { ComponentProps } from 'react'
import { StoryShell as SurfaceStoryShell } from '@vismay/render-surface/story'
import {
  trackStoryViewed,
  trackStorySectionViewed,
  trackStoryCompleted,
} from '@/lib/analytics'

// Depth milestones (% through the story) reported as `story_section_viewed`.
// 100% is reported separately as `story_completed`, so it isn't listed here.
const DEPTH_MILESTONES = [25, 50, 75] as const

/**
 * Public-reader binding of the story shell. Branding (Vizmaya logo + next/link
 * home link) comes from `@vismay/render-surface/story` — extracted there in
 * PR 1 — so this adapter only maps the shell's `onSectionChange` signal onto
 * Amplitude reading-depth events. Every vizmaya route imports the reader
 * through this adapter, so all of them get depth tracking for free — and
 * because the base shell only fires `onSectionChange` on genuine scroll reads,
 * autoplay/capture/embed/editor renders emit nothing.
 */
export default function StoryShell(
  props: ComponentProps<typeof SurfaceStoryShell>
) {
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

  return <SurfaceStoryShell {...props} onSectionChange={handleSectionChange} />
}
