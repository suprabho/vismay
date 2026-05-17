'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

// vizmaya.fyi is the source-of-truth render of the story. VizF1 iframes it so
// scrollytelling, viz modules, and asset resolution all stay in one place.
// The vizmaya-fyi app loads our `f1` vertical via registerVerticalLoader.
const VIZMAYA_ORIGIN = 'https://vizmaya.fyi'

export default function EditorialReader({ slug }: { slug: string }) {
  const [loaded, setLoaded] = useState(false)
  const src = `${VIZMAYA_ORIGIN}/story/${encodeURIComponent(slug)}`

  // Safety net for silent cross-origin failures — after 6s show whatever's there.
  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 6000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="fixed inset-0 bg-bg">
      <Link
        href="/editorial"
        aria-label="Back to editorial"
        className="absolute left-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface/80 text-text backdrop-blur transition-colors hover:bg-surface"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="h-5 w-5"
        >
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>

      {!loaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      )}

      <iframe
        src={src}
        title="Editorial story"
        className="h-full w-full border-0"
        onLoad={() => setLoaded(true)}
        allow="fullscreen"
      />
    </div>
  )
}
