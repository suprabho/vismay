'use client'

import { useEffect, useRef, useState } from 'react'
import type { DcStockUploadTarget } from '@vismay/content-source/epics'

// dc_stocks.market → Stooq exchange suffix (Korea's `.KS` ticker is `.kr` on
// Stooq, so we key off market, not the Yahoo-style ticker suffix).
const STOOQ_SUFFIX: Record<string, string> = { TW: 'tw', KR: 'kr', JP: 'jp', NL: 'nl', HK: 'hk' }

function stooqDataUrl(ticker: string, market: string): string | null {
  const suffix = STOOQ_SUFFIX[market]
  if (!suffix) return null
  // The history *page*, not the raw /q/d/l/ endpoint — hitting that directly
  // returns "Access denied" without a session. Opening the page establishes it;
  // Stooq's own "Download data in csv file" link on the page then works.
  return `https://stooq.com/q/d/?s=${ticker.split('.')[0].toLowerCase()}.${suffix}`
}

type RowState = { status: 'idle' | 'uploading' | 'ok' | 'error'; message?: string }

/**
 * Admin panel for hand-loading the non-US AI Data Centers tickers. Stooq
 * bot-gates CI's datacenter IPs, so the daily CSVs are downloaded in a browser
 * (residential IP) and uploaded here; the route parses + upserts them.
 */
export default function StockUploadCard({ onUploaded }: { onUploaded?: () => void }) {
  const [targets, setTargets] = useState<DcStockUploadTarget[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rowState, setRowState] = useState<Record<string, RowState>>({})
  const [reloadKey, setReloadKey] = useState(0)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  // Re-fetch the ticker list on mount, on the refresh button, and after each
  // upload (all via reloadKey) — inlined in the effect to match the pipeline's
  // fetch idiom and avoid a setState-in-effect lint hit.
  useEffect(() => {
    let cancelled = false
    async function load() {
      const r = await fetch('/api/vizmaya/pipeline/stock-prices')
      const body = await r.json().catch(() => null)
      if (cancelled) return
      if (!r.ok) {
        setLoadError(body?.error ?? `HTTP ${r.status}`)
        return
      }
      setLoadError(null)
      setTargets(body.targets as DcStockUploadTarget[])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  async function upload(ticker: string, file: File) {
    setRowState((s) => ({ ...s, [ticker]: { status: 'uploading' } }))
    const form = new FormData()
    form.set('ticker', ticker)
    form.set('file', file)
    const r = await fetch('/api/vizmaya/pipeline/stock-prices', { method: 'POST', body: form })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) {
      setRowState((s) => ({
        ...s,
        [ticker]: { status: 'error', message: body.error ?? `HTTP ${r.status}` },
      }))
      return
    }
    setRowState((s) => ({
      ...s,
      [ticker]: { status: 'ok', message: `${body.rows} bars · ${body.firstDate} → ${body.lastDate}` },
    }))
    setReloadKey((k) => k + 1) // refresh the coverage line
    onUploaded?.() // refresh the overview's "Stocks 7d" freshness stat
  }

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">International prices — Stooq upload</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Stooq blocks CI&apos;s datacenter IPs, so these non-US tickers are hand-loaded. Click a
            ticker&apos;s <span className="text-neutral-400">Stooq ↗</span> to open its history page,
            use Stooq&apos;s own <em>Download data in csv file</em> link, then upload that file here.
            (Stooq rate-limits — if a file reads &ldquo;Access denied&rdquo;, wait a bit and retry.)
            US tickers come from massive.com automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="text-xs text-neutral-400 hover:text-white px-2 py-1 border border-white/10 rounded-lg hover:bg-white/5 shrink-0"
        >
          refresh
        </button>
      </div>

      {loadError && (
        <p className="text-xs text-red-300 bg-red-950/20 rounded-lg px-3 py-2 mt-3">{loadError}</p>
      )}

      <ul className="mt-3 divide-y divide-white/5">
        {(targets ?? []).map((t) => {
          const rs = rowState[t.ticker] ?? { status: 'idle' as const }
          const dl = stooqDataUrl(t.ticker, t.market)
          return (
            <li key={t.ticker} className="py-2 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{t.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono shrink-0">
                    {t.ticker}
                  </span>
                </div>
                <div
                  className={`text-xs tabular-nums ${t.bars === 0 ? 'text-amber-300' : 'text-neutral-500'}`}
                >
                  {t.bars === 0 ? 'no data yet' : `${t.bars} bars · latest ${t.latestDate}`}
                </div>
                {rs.status === 'ok' && <div className="text-xs text-emerald-300">✓ {rs.message}</div>}
                {rs.status === 'error' && <div className="text-xs text-red-300">✗ {rs.message}</div>}
              </div>
              {dl && (
                <a
                  href={dl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-neutral-400 hover:text-white shrink-0"
                  title="Open this ticker's history on Stooq, then use its download link"
                >
                  Stooq ↗
                </a>
              )}
              <input
                ref={(el) => {
                  fileInputs.current[t.ticker] = el
                }}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = '' // reset so re-picking the same file re-fires
                  if (f) upload(t.ticker, f)
                }}
              />
              <button
                type="button"
                disabled={rs.status === 'uploading'}
                onClick={() => fileInputs.current[t.ticker]?.click()}
                className="text-xs px-2.5 py-1 rounded-lg bg-white text-black hover:bg-neutral-200 disabled:opacity-50 shrink-0"
              >
                {rs.status === 'uploading' ? 'uploading…' : '⬆ Upload'}
              </button>
            </li>
          )
        })}
        {targets && targets.length === 0 && (
          <li className="py-6 text-center text-sm text-neutral-500">
            No international tickers registered.
          </li>
        )}
        {!targets && !loadError && (
          <li className="py-6 text-center text-sm text-neutral-500">loading tickers…</li>
        )}
      </ul>
    </div>
  )
}
