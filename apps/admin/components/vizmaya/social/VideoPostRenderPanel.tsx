'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { usePollVideoRender } from '@/lib/usePollVideoRender'
import type { VideoAspect } from '@/lib/socialPostPlans'
import { RangeRenderPanel } from '@/components/vizmaya/video/RangeRenderPanel'

export function VideoPostRenderPanel({
  slug,
  aspect,
}: {
  slug: string
  aspect: VideoAspect
}) {
  const { state, error, poll } = usePollVideoRender()
  const [cachedUrl, setCachedUrl] = useState<string | null>(null)
  const [probing, setProbing] = useState(true)

  const probe = useCallback(async () => {
    setProbing(true)
    try {
      const r = await fetch(
        `/api/story-video/${encodeURIComponent(slug)}?aspect=${encodeURIComponent(aspect)}`,
        { cache: 'no-store' }
      )
      const body = (await r.json().catch(() => ({}))) as {
        status?: string
        public_url?: string
      }
      if (r.ok && body.status === 'ready' && body.public_url) {
        setCachedUrl(body.public_url)
      } else {
        setCachedUrl(null)
      }
    } finally {
      setProbing(false)
    }
  }, [slug, aspect])

  useEffect(() => {
    probe()
  }, [probe])

  const handleRender = useCallback(
    async (force = false) => {
      try {
        const { public_url } = await poll({ slug, aspect, force })
        setCachedUrl(public_url)
      } catch {
        // surfaced via hook error
      }
    },
    [poll, slug, aspect]
  )

  const isRendering = state === 'rendering'
  const isReady = !!cachedUrl

  return (
    <div className="border border-white/10 rounded-md p-3 space-y-3 bg-white/[0.02]">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium text-neutral-200">Autoplay video</div>
          {probing ? (
            <Pill tone="neutral">Checking…</Pill>
          ) : isRendering ? (
            <Pill tone="amber">Rendering…</Pill>
          ) : isReady ? (
            <Pill tone="emerald">Ready ✓</Pill>
          ) : (
            <Pill tone="neutral">Not rendered</Pill>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => probe()}
            disabled={isRendering}
            className="text-[11px] px-2 py-1 border border-white/10 rounded hover:bg-white/5 disabled:opacity-40"
          >
            Refresh
          </button>
          <button
            onClick={() => handleRender(isReady)}
            disabled={isRendering}
            className="text-[11px] px-2 py-1 bg-white/10 hover:bg-white/15 rounded disabled:opacity-40"
          >
            {isReady ? 'Re-render' : isRendering ? 'Rendering…' : 'Render video'}
          </button>
        </div>
      </div>
      <div className="text-[10px] text-neutral-500">
        {aspect} · dispatches GitHub Actions in prod · polls every 5 min
      </div>
      {cachedUrl && (
        <div className="flex items-center gap-2 text-[11px]">
          <a
            href={cachedUrl}
            target="_blank"
            rel="noreferrer"
            className="text-neutral-200 hover:text-white underline truncate flex-1"
          >
            {cachedUrl.split('/').pop()}
          </a>
          <a
            href={cachedUrl}
            download
            className="px-2 py-0.5 border border-white/10 rounded hover:bg-white/5"
          >
            ↓ Download
          </a>
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-white/5">
        <Link
          href={`/vizmaya/${encodeURIComponent(slug)}?tab=narration`}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] px-2 py-1 border border-white/10 rounded hover:bg-white/5"
        >
          Open Narration editor ↗
        </Link>
        <Link
          href={`/story/${encodeURIComponent(slug)}/autoplay`}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] px-2 py-1 border border-white/10 rounded hover:bg-white/5"
        >
          Open Autoplay preview ↗
        </Link>
      </div>
      {error && <div className="text-[11px] text-red-300">{error}</div>}
      <div className="pt-3 border-t border-white/5">
        <RangeRenderPanel slug={slug} availableAspects={[aspect]} />
      </div>
    </div>
  )
}

function Pill({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: 'emerald' | 'amber' | 'red' | 'neutral'
}) {
  const cls =
    tone === 'emerald'
      ? 'bg-emerald-500/20 text-emerald-200'
      : tone === 'amber'
        ? 'bg-amber-500/20 text-amber-200'
        : tone === 'red'
          ? 'bg-red-500/20 text-red-200'
          : 'bg-white/5 text-neutral-300'
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${cls}`}>
      {children}
    </span>
  )
}
