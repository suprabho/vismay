'use client'

import { useEffect } from 'react'
import { usePollShareRender } from '@vismay/content-source/usePollShareRender'

export function SharePostRenderPanel({
  postId,
  expectedCardIds,
  ratio,
}: {
  postId: string
  expectedCardIds: string[]
  ratio: string
}) {
  const { state, body, error, renderTick, trigger, refresh } = usePollShareRender(postId)

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId])

  const expected = expectedCardIds.length
  const rendered = body?.rendered ?? 0
  const isRendering = state === 'rendering'
  const isReady = state === 'ready' && body?.status === 'ready'

  return (
    <div className="border border-white/10 rounded-md p-3 space-y-3 bg-white/[0.02]">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium text-neutral-200">Share assets</div>
          <StatusBadge state={state} rendered={rendered} expected={expected} />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => refresh()}
            disabled={isRendering}
            className="text-[11px] px-2 py-1 border border-white/10 rounded hover:bg-white/5 disabled:opacity-40"
            title="Re-check rendered state"
          >
            Refresh
          </button>
          <button
            onClick={() => trigger()}
            disabled={isRendering}
            className="text-[11px] px-2 py-1 bg-white/10 hover:bg-white/15 rounded disabled:opacity-40"
          >
            {isReady ? 'Re-render' : isRendering ? 'Rendering…' : 'Render share assets'}
          </button>
        </div>
      </div>
      <div className="text-[10px] text-neutral-500">
        {expected} card{expected === 1 ? '' : 's'} @ {ratio}
        {' · '}
        renders only the cards this post references (~{Math.max(5, expected * 5)}–{expected * 10}s sync · ~1–2 min dispatched)
      </div>
      {body && body.assets.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {body.assets.map((a) => (
            <AssetTile key={a.cardId} asset={a} bust={renderTick} />
          ))}
        </div>
      )}
      {error && <div className="text-[11px] text-red-300">{error}</div>}
    </div>
  )
}

function StatusBadge({
  state,
  rendered,
  expected,
}: {
  state: string
  rendered: number
  expected: number
}) {
  if (state === 'rendering')
    return <Pill tone="amber">Rendering…</Pill>
  if (state === 'error') return <Pill tone="red">Error</Pill>
  if (state === 'ready') return <Pill tone="emerald">Ready ✓</Pill>
  if (state === 'partial')
    return (
      <Pill tone="amber">
        Partial ({rendered}/{expected})
      </Pill>
    )
  return <Pill tone="neutral">Not rendered</Pill>
}

function AssetTile({
  asset,
  bust,
}: {
  asset: { cardId: string; ratio: string; public_url: string | null; fresh: boolean }
  bust: number
}) {
  if (!asset.public_url) {
    return (
      <div className="aspect-square border border-dashed border-white/10 rounded flex items-center justify-center text-[10px] text-neutral-500 p-2 text-center">
        <div>
          <div className="font-mono">{asset.cardId}</div>
          <div className="text-neutral-600 mt-1">Not yet rendered</div>
        </div>
      </div>
    )
  }
  const src = bust > 0 ? `${asset.public_url}?v=${bust}` : asset.public_url
  return (
    <div className="border border-white/10 rounded overflow-hidden bg-black/40">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={asset.cardId}
        className="w-full h-auto block"
        style={{ aspectRatio: ratioToAspect(asset.ratio) }}
      />
      <div className="flex items-center justify-between px-2 py-1 border-t border-white/10 text-[10px]">
        <span className="font-mono text-neutral-400 truncate">{asset.cardId}</span>
        <a
          href={src}
          download
          target="_blank"
          rel="noreferrer"
          className="text-neutral-300 hover:text-white shrink-0"
        >
          ↓ Download
        </a>
      </div>
      {!asset.fresh && (
        <div className="px-2 py-0.5 text-[10px] text-amber-300/80 border-t border-white/5">
          Stale (content changed since last render)
        </div>
      )}
    </div>
  )
}

function ratioToAspect(ratio: string): string {
  const [w, h] = ratio.split(':').map((n) => Number(n) || 1)
  return `${w} / ${h}`
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
