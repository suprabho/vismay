'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Re-render the server page on an interval while a game on it is live. */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, seconds * 1000)
    return () => clearInterval(id)
  }, [router, seconds])
  return null
}
