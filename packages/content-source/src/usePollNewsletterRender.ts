'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type NewsletterPollState = 'idle' | 'ready' | 'rendering' | 'error'

export interface NewsletterPollResult {
  public_url: string
  substack_url: string | null
}

// Newsletter renders complete in ~1min (maps dominate); poll 10s × 30
// attempts → 5-minute ceiling, same budget as the PDF hook.
const POLL_MS = 10_000
const MAX_ATTEMPTS = 30

export function usePollNewsletterRender(slug: string) {
  const [state, setState] = useState<NewsletterPollState>('idle')
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const [substackUrl, setSubstackUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef(false)

  useEffect(() => {
    return () => {
      cancelRef.current = true
    }
  }, [])

  const endpoint = useCallback(
    (force = false) => {
      const params = new URLSearchParams()
      if (force) params.set('force', '1')
      const qs = params.toString()
      return `/api/story-newsletter/${encodeURIComponent(slug)}${qs ? `?${qs}` : ''}`
    },
    [slug]
  )

  const probe = useCallback(async (): Promise<NewsletterPollResult | null> => {
    const r = await fetch(endpoint(false), { cache: 'no-store' })
    const body = (await r.json().catch(() => ({}))) as {
      status?: string
      public_url?: string
      substack_url?: string | null
      error?: string
    }
    if (r.ok && body.status === 'ready' && body.public_url) {
      setPublicUrl(body.public_url)
      setSubstackUrl(body.substack_url ?? null)
      setState('ready')
      setError(null)
      return { public_url: body.public_url, substack_url: body.substack_url ?? null }
    }
    if (r.status === 202 || body.status === 'rendering') {
      setState('rendering')
      return null
    }
    if (!r.ok) {
      throw new Error(body.error ?? `HTTP ${r.status}`)
    }
    return null
  }, [endpoint])

  const refresh = useCallback(async () => {
    try {
      await probe()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'fetch failed'
      setError(msg)
      setState('error')
    }
  }, [probe])

  const trigger = useCallback(
    async ({ force }: { force?: boolean } = {}) => {
      setError(null)
      setState('rendering')
      setPublicUrl(null)
      setSubstackUrl(null)
      try {
        // Initial call (with force=1 if requested) kicks dispatch + may
        // return ready immediately in sync mode.
        const r = await fetch(endpoint(!!force), { cache: 'no-store' })
        const body = (await r.json().catch(() => ({}))) as {
          status?: string
          public_url?: string
          substack_url?: string | null
          error?: string
        }
        if (r.ok && body.status === 'ready' && body.public_url) {
          setPublicUrl(body.public_url)
          setSubstackUrl(body.substack_url ?? null)
          setState('ready')
          return {
            public_url: body.public_url,
            substack_url: body.substack_url ?? null,
          }
        }
        if (!r.ok && r.status !== 202) {
          throw new Error(body.error ?? `HTTP ${r.status}`)
        }
        // Dispatched — poll.
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          if (cancelRef.current) return null
          await new Promise((res) => setTimeout(res, POLL_MS))
          if (cancelRef.current) return null
          try {
            const result = await probe()
            if (result) return result
          } catch {
            // transient — keep polling
          }
        }
        throw new Error('render timed out — try again later')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'render failed'
        setError(msg)
        setState('error')
        throw err
      }
    },
    [endpoint, probe]
  )

  return { state, publicUrl, substackUrl, error, trigger, refresh }
}
