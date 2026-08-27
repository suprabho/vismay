'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DcStockSeries } from '@vismay/content-source/epics'
import { isStale } from '@/components/vizmaya/pipeline/shared'

// Trailing-window options for the sparklines, mirroring the public stocks API
// (default 90d, capped at 730 on the route).
const WINDOWS = [30, 90, 180, 365] as const

// dc_stocks.category → display label, in the reader's own ordering
// (getDcStockMarket orders by category then ticker).
const CATEGORY_LABELS: Record<string, string> = {
  semiconductors: 'Semiconductors',
  'semi-equipment': 'Semi equipment',
  hyperscalers: 'Hyperscalers',
  'data-centers': 'Data centers',
}

function formatPrice(value: number, currency: string): string {
  // Intl handles the currency symbol/placement; fall back to a plain number for
  // any code Intl doesn't recognise.
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

// direction: +1 up, -1 down, 0 flat/unknown → emerald / rose / neutral. Colour
// is never the only cue — the signed % + arrow beside the sparkline carries it
// too, so the card stays legible for colour-blind readers.
function toneClass(direction: number): string {
  if (direction > 0) return 'text-emerald-400'
  if (direction < 0) return 'text-rose-400'
  return 'text-neutral-500'
}

/**
 * A compact area sparkline of one ticker's closes over the window. Stretches to
 * the card width via preserveAspectRatio="none" + a non-scaling stroke (so the
 * line stays crisp at any width); the y-scale is the series' own min→max so the
 * shape reads even on a tight range. Colour comes from the wrapping `text-*`.
 */
function Sparkline({ points }: { points: [string, number][] }) {
  const closes = points.map((p) => p[1])
  const n = closes.length
  const W = 100
  const H = 40
  const PAD = 3 // keep the extremes off the top/bottom edge
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const range = max - min || 1
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2)
  const y = (c: number) => PAD + (H - 2 * PAD) * (1 - (c - min) / range)
  const coords = closes.map((c, i) => [x(i), y(c)] as const)
  const line = coords.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)}`).join(' ')
  const area = `${line} L${coords[n - 1][0].toFixed(2)},${H} L${coords[0][0].toFixed(2)},${H} Z`
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-11 mt-2 overflow-visible"
      role="img"
      aria-hidden="true"
    >
      <path d={area} fill="currentColor" fillOpacity={0.1} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function StockCard({ stock }: { stock: DcStockSeries }) {
  const hasSeries = stock.points.length >= 2
  const direction = stock.changePct == null ? 0 : Math.sign(stock.changePct)
  const arrow = direction > 0 ? '▲' : direction < 0 ? '▼' : '·'
  const stale = isStale(stock.latestDate, 7 * 24)
  return (
    <div className="bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-sm font-semibold truncate" title={stock.ticker}>
            {stock.ticker}
          </div>
          <div className="text-[11px] text-neutral-500 truncate" title={`${stock.name} · ${stock.exchange}`}>
            {stock.name}
          </div>
        </div>
        <div className={`text-xs font-semibold tabular-nums shrink-0 ${toneClass(direction)}`}>
          {stock.changePct == null ? '—' : `${arrow} ${stock.changePct >= 0 ? '+' : ''}${stock.changePct.toFixed(1)}%`}
        </div>
      </div>

      {hasSeries ? (
        <span className={toneClass(direction)}>
          <Sparkline points={stock.points} />
        </span>
      ) : (
        <div className="h-11 mt-2 flex items-center justify-center text-[11px] text-neutral-600">
          no price data yet
        </div>
      )}

      <div className="flex items-baseline justify-between gap-2 mt-1.5">
        <span className="text-sm font-semibold tabular-nums">
          {stock.latestClose == null ? '—' : formatPrice(stock.latestClose, stock.currency)}
        </span>
        <span className={`text-[10px] tabular-nums ${stale ? 'text-amber-300' : 'text-neutral-600'}`} title={stock.latestDate ?? undefined}>
          {stock.latestDate ?? 'no data'}
        </span>
      </div>
    </div>
  )
}

/**
 * US tracked-stock sparklines for the Pipeline tab. The US price bars land
 * automatically from massive.com (the non-US names are hand-uploaded via the
 * Stooq card above), so this reads them straight from getDcStockMarket and
 * renders one area sparkline per ticker, grouped by category.
 */
export default function StockMarketCard() {
  const [stocks, setStocks] = useState<DcStockSeries[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [days, setDays] = useState<number>(90)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadError(null)
      const r = await fetch(`/api/vizmaya/pipeline/stock-market?days=${days}`)
      const body = await r.json().catch(() => null)
      if (cancelled) return
      if (!r.ok) {
        setLoadError(body?.error ?? `HTTP ${r.status}`)
        return
      }
      setStocks(body.stocks as DcStockSeries[])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [days, reloadKey])

  // US only — the international names are covered by the Stooq upload card.
  // getDcStockMarket already orders by category then ticker, so a stable
  // reduce preserves that grouping order.
  const groups = useMemo(() => {
    const us = (stocks ?? []).filter((s) => s.market === 'US')
    const byCategory = new Map<string, DcStockSeries[]>()
    for (const s of us) {
      if (!byCategory.has(s.category)) byCategory.set(s.category, [])
      byCategory.get(s.category)!.push(s)
    }
    return [...byCategory.entries()]
  }, [stocks])

  const usCount = useMemo(() => groups.reduce((n, [, list]) => n + list.length, 0), [groups])

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">US stocks — daily closes</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Sparkline per tracked US ticker, priced automatically from massive.com. Range shows the
            {' '}first→last close change over the window. (Non-US names are hand-loaded above.)
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="text-xs bg-neutral-900 border border-white/10 rounded-lg px-2 py-1 text-neutral-100 cursor-pointer"
            aria-label="Sparkline window (days)"
          >
            {WINDOWS.map((w) => (
              <option key={w} value={w}>
                {w}d
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="text-xs text-neutral-400 hover:text-white px-2 py-1 border border-white/10 rounded-lg hover:bg-white/5"
          >
            refresh
          </button>
        </div>
      </div>

      {loadError && (
        <p className="text-xs text-red-300 bg-red-950/20 rounded-lg px-3 py-2 mt-3">{loadError}</p>
      )}

      {!stocks && !loadError && (
        <p className="py-6 text-center text-sm text-neutral-500">loading stocks…</p>
      )}

      {stocks && usCount === 0 && !loadError && (
        <p className="py-6 text-center text-sm text-neutral-500">No US tickers registered.</p>
      )}

      {groups.map(([category, list]) => (
        <div key={category} className="mt-4">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">
            {CATEGORY_LABELS[category] ?? category}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {list.map((s) => (
              <StockCard key={s.ticker} stock={s} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
