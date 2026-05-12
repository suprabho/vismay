'use client'

import { useCallback, useState } from 'react'
import type { VideoAspect } from './storyVideo'

export type PollState = 'idle' | 'rendering' | 'error'

export interface PollVideoArgs {
  slug: string
  aspect: VideoAspect
  force?: boolean
}

export interface PollVideoResult {
  public_url: string
}

// 5-minute cadence, 12 attempts → 1-hour ceiling. Video renders take many
// minutes on the runner; polling every 15s was generating dozens of
// pointless requests during the flat middle of a render. The trade-off is
// that a render finishing 30s after a poll waits up to 5 more minutes
// before the link surfaces — acceptable for an admin/power-user surface.
const POLL_MS = 300_000
const MAX_ATTEMPTS = 12

export function usePollVideoRender(): {
  state: PollState
  error: string | null
  poll: (args: PollVideoArgs) => Promise<PollVideoResult>
  reset: () => void
} {
  const [state, setState] = useState<PollState>('idle')
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setState('idle')
    setError(null)
  }, [])

  const poll = useCallback(
    async ({ slug, aspect, force }: PollVideoArgs): Promise<PollVideoResult> => {
      setState('rendering')
      setError(null)

      const params = new URLSearchParams({ aspect })
      if (force) params.set('force', '1')
      const endpoint = `/api/story-video/${slug}?${params.toString()}`

      try {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          const res = await fetch(endpoint, { cache: 'no-store' })
          const body = (await res.json().catch(() => ({}))) as {
            status?: string
            public_url?: string
            error?: string
          }
          if (res.ok && body.status === 'ready' && body.public_url) {
            setState('idle')
            return { public_url: body.public_url }
          }
          if (res.status === 202 || body.status === 'rendering') {
            await new Promise((r) => setTimeout(r, POLL_MS))
            continue
          }
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        throw new Error('render timed out — try again later')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'render failed'
        setError(msg)
        setState('error')
        throw err
      }
    },
    []
  )

  return { state, error, poll, reset }
}
