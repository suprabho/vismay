'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type ShareAsset = {
  cardId: string
  ratio: string
  public_url: string | null
  fresh: boolean
}

export type ShareStatus = 'ready' | 'partial' | 'idle' | 'rendering' | 'error'

export interface ShareStateBody {
  status: 'ready' | 'partial' | 'idle'
  expected: number
  rendered: number
  assets: ShareAsset[]
}

// Sync renders complete in seconds; dispatched ones in 1–3 min. We don't
// know the mode until POST returns, so default to 15s and tighten if the
// server reports sync. 20 attempts → 5 min ceiling.
const POLL_MS = 15_000
const MAX_ATTEMPTS = 20

export function usePollShareRender(postId: string) {
  const [state, setState] = useState<ShareStatus>('idle')
  const [body, setBody] = useState<ShareStateBody | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Bumped after every successful re-render trigger so the UI can append a
  // cache-busting query param to the thumbnail URLs. Without this, Supabase
  // serves the new PNG at the same URL and the browser keeps the cached one.
  const [renderTick, setRenderTick] = useState(0)
  const cancelRef = useRef(false)

  useEffect(() => {
    return () => {
      cancelRef.current = true
    }
  }, [])

  const fetchState = useCallback(
    async (): Promise<ShareStateBody | null> => {
      const r = await fetch(
        `/api/admin/social/posts/${encodeURIComponent(postId)}/render-share`,
        { cache: 'no-store' }
      )
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error ?? `HTTP ${r.status}`)
      }
      const b = (await r.json()) as ShareStateBody
      setBody(b)
      return b
    },
    [postId]
  )

  const refresh = useCallback(async () => {
    try {
      const b = await fetchState()
      if (!b) return
      setState(b.status === 'ready' ? 'ready' : b.status === 'idle' ? 'idle' : 'partial')
      setError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'fetch failed'
      setError(msg)
      setState('error')
    }
  }, [fetchState])

  const trigger = useCallback(async (): Promise<void> => {
    setError(null)
    setState('rendering')
    try {
      const r = await fetch(
        `/api/admin/social/posts/${encodeURIComponent(postId)}/render-share`,
        { method: 'POST' }
      )
      const j = (await r.json().catch(() => ({}))) as {
        mode?: 'sync' | 'dispatched'
        rendered?: number
        skipped?: number
        error?: string
      }
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)

      if (j.mode === 'sync') {
        // Sync renders complete before POST returns. Refresh once.
        await refresh()
        setRenderTick((t) => t + 1)
        return
      }

      // Dispatched: poll until ready or timeout.
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (cancelRef.current) return
        await new Promise((res) => setTimeout(res, POLL_MS))
        if (cancelRef.current) return
        try {
          const b = await fetchState()
          if (b && b.status === 'ready') {
            setState('ready')
            setRenderTick((t) => t + 1)
            return
          }
        } catch {
          // transient — keep polling
        }
      }
      // Timed out — fall back to whatever state we last saw.
      await refresh()
      setRenderTick((t) => t + 1)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'render failed'
      setError(msg)
      setState('error')
    }
  }, [postId, refresh, fetchState])

  return { state, body, error, renderTick, trigger, refresh }
}
