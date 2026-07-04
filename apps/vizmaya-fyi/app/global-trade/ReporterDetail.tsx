'use client'

import { useEffect, useState } from 'react'
import DetailSheet from '@/components/DetailSheet'
import TotalExportsChart from '@/components/global-trade/charts/TotalExportsChart'
import TopProductsChart from '@/components/global-trade/charts/TopProductsChart'
import { formatUsd } from '@/components/global-trade/charts/colors'
import type { ReporterTradeProfile } from '@vismay/content-source/trade'

interface Props {
  code: string
  onClose: () => void
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: ReporterTradeProfile }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

export default function ReporterDetail({ code, onClose }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    fetch(`/api/global-trade/reporter/${encodeURIComponent(code)}`)
      .then(async (r) => {
        if (r.status === 404) {
          if (!cancelled) setState({ kind: 'missing' })
          return
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = (await r.json()) as ReporterTradeProfile
        if (!cancelled) setState({ kind: 'ready', data })
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: 'error', message: String(err) })
      })
    return () => { cancelled = true }
  }, [code])

  return (
    <DetailSheet>
      <Header title={state.kind === 'ready' ? state.data.name : code} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
        {state.kind === 'loading' && (
          <p className="text-xs font-mono text-zinc-500 mt-3">Loading exports profile…</p>
        )}
        {state.kind === 'error' && (
          <p className="text-xs font-mono text-rose-400 mt-3">Failed to load: {state.message}</p>
        )}
        {state.kind === 'missing' && (
          <p className="text-xs font-mono text-zinc-500 mt-3">
            This country isn&apos;t in the tracked reporter set yet.
          </p>
        )}
        {state.kind === 'ready' && <Profile data={state.data} />}
      </div>
    </DetailSheet>
  )
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div
      className="px-4 pt-3 pb-3 flex items-start justify-between gap-2 shrink-0"
      style={{ borderBottom: '1px solid color-mix(in srgb, var(--vmy-bone) 8%, transparent)' }}
    >
      <div className="min-w-0">
        <p
          className="text-[10px] font-mono uppercase tracking-[0.22em] mb-1"
          style={{ color: 'var(--vmy-ember)' }}
        >
          Exports profile
        </p>
        <h2
          className="text-lg leading-snug truncate"
          style={{ color: 'var(--vmy-bone)', fontWeight: 500 }}
        >
          {title}
        </h2>
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        className="text-lg leading-none shrink-0 hover:text-white"
        style={{ color: 'color-mix(in srgb, var(--vmy-bone) 50%, transparent)' }}
      >
        ×
      </button>
    </div>
  )
}

function Profile({ data }: { data: ReporterTradeProfile }) {
  const { years, values } = data.totalExports
  if (data.latestYear == null || years.length === 0) {
    return (
      <p className="text-xs font-mono text-zinc-500 mt-3">
        No export rows for this reporter yet. Try{' '}
        <code className="bg-zinc-900 px-1.5 py-0.5 rounded text-[10px]">pnpm trade:import-comtrade</code>.
      </p>
    )
  }

  const valueAt = (year: number): number | null => {
    const i = years.indexOf(year)
    return i >= 0 ? values[i] : null
  }
  const latestTotal = valueAt(data.latestYear)
  const prevTotal = valueAt(data.latestYear - 1)
  const firstYear = years.find((y, i) => values[i] != null) ?? null
  const firstTotal = firstYear != null ? valueAt(firstYear) : null

  const yoy =
    latestTotal != null && prevTotal != null && prevTotal > 0
      ? ((latestTotal - prevTotal) / prevTotal) * 100
      : null
  const multiple =
    latestTotal != null && firstTotal != null && firstTotal > 0 ? latestTotal / firstTotal : null
  const topShare =
    latestTotal != null && latestTotal > 0 && data.topProducts.length > 0
      ? (data.topProducts[0].valueUsd / latestTotal) * 100
      : null

  return (
    <>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Tile
          label="Goods exports"
          value={latestTotal != null ? formatUsd(latestTotal) : '—'}
          detail={String(data.latestYear)}
        />
        <Tile
          label="Year on year"
          value={yoy != null ? `${yoy >= 0 ? '+' : ''}${yoy.toFixed(1)}%` : '—'}
          detail={yoy != null ? `vs ${data.latestYear - 1}` : 'no prior year'}
        />
        <Tile
          label={`Since ${firstYear ?? '—'}`}
          value={multiple != null ? `${multiple.toFixed(1)}×` : '—'}
          detail={firstTotal != null ? formatUsd(firstTotal) : ''}
        />
        <Tile
          label="Top product share"
          value={topShare != null ? `${topShare.toFixed(1)}%` : '—'}
          detail={data.topProducts[0] ? `HS ${data.topProducts[0].hsCode}` : ''}
        />
      </div>

      <ChartBlock title="Total goods exports" subtitle={`Nominal USD per year, ${years[0]}–${years[years.length - 1]}`}>
        <TotalExportsChart years={years} values={values} />
      </ChartBlock>

      {data.topProducts.length > 0 && (
        <ChartBlock title="Top products" subtitle={`HS4 headings by export value, ${data.latestYear}`}>
          <TopProductsChart products={data.topProducts} />
        </ChartBlock>
      )}

      <p
        className="text-[10px] font-mono leading-snug"
        style={{ color: 'color-mix(in srgb, var(--vmy-bone) 30%, transparent)' }}
      >
        {data.source === 'comtrade' && (
          <>Data: UN Comtrade Database, United Nations Statistics Division.</>
        )}
        {data.source === 'oec' && (
          <>Data: BACI (CEPII), via the Observatory of Economic Complexity (Datawheel).</>
        )}
        {data.source === 'trademap' && <>Data: ITC Trade Map, International Trade Centre.</>}{' '}
        Values are nominal USD, not inflation-adjusted.
      </p>
    </>
  )
}

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div
      className="rounded-md px-3 py-2"
      style={{
        background: 'color-mix(in srgb, var(--vmy-bone) 4%, transparent)',
        border: '1px solid color-mix(in srgb, var(--vmy-bone) 6%, transparent)',
      }}
    >
      <div
        className="text-[9px] font-mono uppercase tracking-[0.18em]"
        style={{ color: 'color-mix(in srgb, var(--vmy-bone) 50%, transparent)' }}
      >
        {label}
      </div>
      <div className="text-lg leading-none mt-1" style={{ color: 'var(--vmy-bone)', fontWeight: 500 }}>
        {value}
      </div>
      {detail && (
        <div
          className="text-[10px] font-mono mt-0.5"
          style={{ color: 'color-mix(in srgb, var(--vmy-bone) 35%, transparent)' }}
        >
          {detail}
        </div>
      )}
    </div>
  )
}

function ChartBlock({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1">
        <p className="text-xs" style={{ color: 'var(--vmy-bone)', fontWeight: 500 }}>{title}</p>
        <p
          className="text-[10px] font-mono"
          style={{ color: 'color-mix(in srgb, var(--vmy-bone) 45%, transparent)' }}
        >
          {subtitle}
        </p>
      </div>
      {children}
    </div>
  )
}
