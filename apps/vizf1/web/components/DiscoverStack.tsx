'use client'

import { useNewsFeed } from '@/lib/useNewsFeed'
import { NewsReel } from '@/components/NewsReel'

export function DiscoverStack() {
  const q = useNewsFeed()
  if (q.isLoading)
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  if (q.error)
    return (
      <div className="m-4 rounded-xl border border-border bg-surface p-4 text-sm text-muted">
        Couldn't load news: {(q.error as Error).message}
      </div>
    )
  const items = q.data ?? []
  return <NewsReel items={items} />
}
