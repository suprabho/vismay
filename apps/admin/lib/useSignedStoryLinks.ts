'use client'

import { useEffect, useState } from 'react'
import type { SignedStoryLinks } from './signedConsumerLinks'

/**
 * Fetch the signed-URL bag for a story slug from admin's own API.
 *
 * Used by client components that don't have a natural server-render parent
 * to receive `signedLinks` as a prop — primarily the per-post panels in the
 * social planner. Returns `null` while loading or on failure; callers
 * should fall back to a disabled link state when the bag isn't ready.
 *
 * One fetch per (slug, mount). Tokens are 24h so re-renders within a
 * session don't need to re-fetch. If a token expires mid-session the
 * underlying click 401s on the consumer side and a reload re-mints.
 */
export function useSignedStoryLinks(slug: string | null | undefined): SignedStoryLinks | null {
  const [links, setLinks] = useState<SignedStoryLinks | null>(null)

  useEffect(() => {
    if (!slug) {
      setLinks(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/vizmaya/sign-story-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug }),
        })
        if (!res.ok) return
        const data = (await res.json()) as SignedStoryLinks
        if (!cancelled) setLinks(data)
      } catch {
        // Swallow — the UI keeps its disabled-link fallback.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  return links
}
