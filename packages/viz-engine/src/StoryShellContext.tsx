'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { ResolvedUnit, StoryDefaults } from './lib/storyConfig.types'
import type { MapOverrideConfig } from './lib/storyMapOverrides'

/**
 * Page-level data that some background modules (notably `map`) need but the
 * generic `BackgroundVizSlot` shouldn't know about. The slot provider wraps
 * its children once; modules read whichever fields apply to them.
 *
 * Why not pass these as props down through the slot? The slot is meant to be
 * generic across viz types, and a `mapOverrides` field hanging off the slot's
 * props would leak map-specifics into every future module. Context lets each
 * module read what it needs without widening the slot API.
 */
export interface StoryShellContextValue {
  accessToken: string
  defaults: StoryDefaults
  mapOverrides: MapOverrideConfig | null | undefined
  isAutoplay: boolean
  isPortrait: boolean
  isCapture: boolean
  /** The active units array. Modules needing per-subsection overrides (e.g. map) read this. */
  units: ResolvedUnit[]
}

const StoryShellContext = createContext<StoryShellContextValue | null>(null)

export function StoryShellProvider({
  value,
  children,
}: {
  value: StoryShellContextValue
  children: ReactNode
}) {
  return <StoryShellContext.Provider value={value}>{children}</StoryShellContext.Provider>
}

export function useStoryShell(): StoryShellContextValue {
  const v = useContext(StoryShellContext)
  if (!v) throw new Error('useStoryShell must be used inside <StoryShellProvider>')
  return v
}
