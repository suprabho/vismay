'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { loadVertical } from './verticals'

/**
 * Gate the story shell on vertical-module registration. Pure clients only;
 * the SSG render emits its children synchronously and the registration
 * happens during the client's first commit so the slot dispatchers see the
 * vertical's modules by the time they look them up.
 *
 * Why this is a separate boundary: the viz registry is a per-runtime
 * singleton. The server can register modules for its own render pass, but
 * the client's bundle has its own registry instance — so the registration
 * has to happen client-side too, before the slots mount and call
 * `getVizModule(...)`. Wrapping the shell in this loader is the smallest
 * place to put it without changing the slot dispatchers.
 */
export default function VerticalLoader({
  vertical,
  children,
}: {
  vertical: string | undefined
  children: ReactNode
}) {
  // No vertical → render immediately. Most vizmaya.fyi stories take this path
  // and pay zero load cost (the dynamic import in verticals.ts never fires).
  const [ready, setReady] = useState<boolean>(!vertical)

  useEffect(() => {
    if (!vertical) return
    let cancelled = false
    loadVertical(vertical).then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [vertical])

  if (!ready) return null
  return <>{children}</>
}
