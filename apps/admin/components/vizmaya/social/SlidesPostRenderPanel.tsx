'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { usePollPdfRender } from '@vismay/content-source/usePollPdfRender'
import { useSignedStoryLinks } from '@/lib/useSignedStoryLinks'

export function SlidesPostRenderPanel({ slug }: { slug: string }) {
  const { state, publicUrl, error, trigger, refresh } = usePollPdfRender(slug, 'slides')
  const signedLinks = useSignedStoryLinks(slug)

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  const isRendering = state === 'rendering'
  const isReady = state === 'ready' && !!publicUrl

  return (
    <div className="border border-white/10 rounded-md p-3 space-y-3 bg-white/[0.02]">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium text-neutral-200">Slides PDF</div>
          {isRendering ? (
            <Pill tone="amber">Rendering…</Pill>
          ) : isReady ? (
            <Pill tone="emerald">Ready ✓</Pill>
          ) : state === 'error' ? (
            <Pill tone="red">Error</Pill>
          ) : (
            <Pill tone="neutral">Not rendered</Pill>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => refresh()}
            disabled={isRendering}
            className="text-[11px] px-2 py-1 border border-white/10 rounded hover:bg-white/5 disabled:opacity-40"
          >
            Refresh
          </button>
          <button
            onClick={() => trigger({ force: isReady })}
            disabled={isRendering}
            className="text-[11px] px-2 py-1 bg-white/10 hover:bg-white/15 rounded disabled:opacity-40"
          >
            {isReady ? 'Re-render' : isRendering ? 'Rendering…' : 'Render slides PDF'}
          </button>
        </div>
      </div>
      <div className="text-[10px] text-neutral-500">
        1920×1080 16:9 deck · ~30s sync · ~1–2 min dispatched
      </div>
      {publicUrl && (
        <div className="flex items-center gap-2 text-[11px]">
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="text-neutral-200 hover:text-white underline truncate flex-1"
          >
            {publicUrl.split('/').pop()}
          </a>
          <a
            href={publicUrl}
            download
            className="px-2 py-0.5 border border-white/10 rounded hover:bg-white/5"
          >
            ↓ Download
          </a>
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-white/5">
        <Link
          href={signedLinks?.reports ?? '#'}
          aria-disabled={!signedLinks}
          target="_blank"
          rel="noreferrer"
          className={`text-[11px] px-2 py-1 border border-white/10 rounded ${
            signedLinks ? 'hover:bg-white/5' : 'opacity-40 pointer-events-none'
          }`}
        >
          Open report builder ↗
        </Link>
        <Link
          href={signedLinks?.slides ?? '#'}
          aria-disabled={!signedLinks}
          target="_blank"
          rel="noreferrer"
          className={`text-[11px] px-2 py-1 border border-white/10 rounded ${
            signedLinks ? 'hover:bg-white/5' : 'opacity-40 pointer-events-none'
          }`}
        >
          Open slides preview ↗
        </Link>
      </div>
      {error && <div className="text-[11px] text-red-300">{error}</div>}
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
