'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * A card's cover photo that survives a dead source. Authors' covers are often
 * hotlinked (Wikimedia, an image proxy) and can 404 or be rate-limited, so
 * each failed URL hands over to the next, and when none loads the card shows
 * `fallback` instead of a broken image.
 */
export function CoverImage({ srcs, fallback = null }: { srcs: Array<string | null | undefined>; fallback?: ReactNode }) {
  const list = srcs.filter((s): s is string => !!s)
  const [i, setI] = useState(0)
  const ref = useRef<HTMLImageElement>(null)
  const src = list[i]

  // A server-rendered <img> can fail before hydration attaches onError: catch it here.
  useEffect(() => {
    const img = ref.current
    if (img && img.complete && img.naturalWidth === 0) setI((n) => n + 1)
  }, [src])

  if (!src) return <>{fallback}</>
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote images of unknown host
    <img
      ref={ref}
      key={src}
      src={src}
      alt=""
      loading="lazy"
      onError={() => setI((n) => n + 1)}
      className="absolute inset-0 size-full object-cover"
    />
  )
}
