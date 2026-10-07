'use client'

import dynamic from 'next/dynamic'
import { CircleNotch } from '@phosphor-icons/react'

/**
 * The f1-viz 3D track view, loaded lazily: three.js only loads with the
 * replay, never on the server. Cars use the default livery-free model,
 * painted in team colours.
 */
export const LazyTrackScene = dynamic(
  () =>
    import('@vismay/f1-viz/web/three').then(({ TrackScene3D: Scene, DEFAULT_CAR_MODEL_URL }) => {
      const WithCars = (props: React.ComponentProps<typeof Scene>) => <Scene carModelUrl={DEFAULT_CAR_MODEL_URL} {...props} />
      return WithCars
    }),
  { ssr: false, loading: () => <ReplayStatus>Loading 3D view…</ReplayStatus> },
)

export function ReplayStatus({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center gap-2 font-mono text-xs text-muted">
      <CircleNotch size={16} className="animate-spin motion-reduce:animate-none" aria-hidden />
      {children}
    </div>
  )
}
