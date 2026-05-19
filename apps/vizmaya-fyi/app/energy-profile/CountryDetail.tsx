'use client'

import { useEffect, useState } from 'react'
import DetailSheet from '@/components/DetailSheet'
import ElectricityMixChart from '@/components/energy-profile/charts/ElectricityMixChart'
import PrimaryEnergyMixChart from '@/components/energy-profile/charts/PrimaryEnergyMixChart'
import Co2Chart from '@/components/energy-profile/charts/Co2Chart'
import RenewablesShareChart from '@/components/energy-profile/charts/RenewablesShareChart'
import OilPricesChart from '@/components/energy-profile/charts/OilPricesChart'
import type { IeaCountryProfile } from '@vismay/content-source/epics'

interface Props {
  code: string
  onClose: () => void
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: IeaCountryProfile }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

export default function CountryDetail({ code, onClose }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    fetch(`/api/energy-profile/country/${encodeURIComponent(code)}`)
      .then(async (r) => {
        if (r.status === 404) {
          if (!cancelled) setState({ kind: 'missing' })
          return
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = (await r.json()) as IeaCountryProfile
        if (!cancelled) setState({ kind: 'ready', data })
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: 'error', message: String(err) })
      })
    return () => { cancelled = true }
  }, [code])

  return (
    <DetailSheet>
      <Header
        title={state.kind === 'ready' ? state.data.name : code}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
        {state.kind === 'loading' && (
          <p className="text-xs font-mono text-zinc-500 mt-3">Loading profile…</p>
        )}
        {state.kind === 'error' && (
          <p className="text-xs font-mono text-rose-400 mt-3">Failed to load: {state.message}</p>
        )}
        {state.kind === 'missing' && (
          <p className="text-xs font-mono text-zinc-500 mt-3">
            No profile data for this country yet.
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
          Country profile
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

function Profile({ data }: { data: IeaCountryProfile }) {
  const hasEnergyData =
    data.timeseries.electricityMix.years.length > 0 ||
    data.timeseries.primaryEnergyMix.years.length > 0 ||
    data.timeseries.co2.years.length > 0

  return (
    <>
      {data.summary && (
        <p className="text-sm leading-relaxed mt-3" style={{ color: 'color-mix(in srgb, var(--vmy-bone) 80%, transparent)' }}>
          {data.summary}
        </p>
      )}

      {hasEnergyData ? (
        <>
          <Tiles latest={data.latest} />
          <ChartBlock title="Electricity mix" subtitle="Share of generation, by source">
            {data.timeseries.electricityMix.years.length > 0 ? (
              <ElectricityMixChart
                years={data.timeseries.electricityMix.years}
                series={data.timeseries.electricityMix.series}
              />
            ) : (
              <EmptyChart />
            )}
          </ChartBlock>
          <ChartBlock title="Primary energy mix" subtitle="Share of total energy supply, by source">
            {data.timeseries.primaryEnergyMix.years.length > 0 ? (
              <PrimaryEnergyMixChart
                years={data.timeseries.primaryEnergyMix.years}
                series={data.timeseries.primaryEnergyMix.series}
              />
            ) : (
              <EmptyChart />
            )}
          </ChartBlock>
          <ChartBlock title="GHG emissions from energy" subtitle="Million tonnes CO₂-equivalent">
            {data.timeseries.co2.years.length > 0 ? (
              <Co2Chart years={data.timeseries.co2.years} values={data.timeseries.co2.values} />
            ) : (
              <EmptyChart />
            )}
          </ChartBlock>
          <ChartBlock title="Renewables in electricity" subtitle="Share of generation from renewables">
            {data.timeseries.renewablesShare.years.length > 0 ? (
              <RenewablesShareChart
                years={data.timeseries.renewablesShare.years}
                values={data.timeseries.renewablesShare.values}
              />
            ) : (
              <EmptyChart />
            )}
          </ChartBlock>
          {data.timeseries.oilPrices.months.length > 0 && (
            <ChartBlock title="Retail fuel prices" subtitle="Pump price, USD per litre, monthly (IEA)">
              <OilPricesChart
                months={data.timeseries.oilPrices.months}
                gasoline={data.timeseries.oilPrices.gasoline}
                diesel={data.timeseries.oilPrices.diesel}
              />
            </ChartBlock>
          )}
        </>
      ) : (
        <p className="text-xs font-mono text-zinc-500">
          No OWID energy data for this country yet. Try{' '}
          <code className="bg-zinc-900 px-1.5 py-0.5 rounded text-[10px]">pnpm energy-profile:import-owid</code>.
        </p>
      )}

      {data.news.length > 0 && (
        <div>
          <p
            className="text-[10px] font-mono uppercase tracking-[0.22em] mb-2"
            style={{ color: 'color-mix(in srgb, var(--vmy-bone) 45%, transparent)' }}
          >
            — Recent news
          </p>
          <ul className="space-y-3">
            {data.news.map((n) => {
              const source = extractNewsSource(n.summary)
              const cleanSummary = cleanNewsSummary(n.summary, n.title)
              const date = new Date(n.publishedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })
              return (
                <li key={n.id}>
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                  >
                    <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-0.5 font-mono">
                      {date}
                      {source && <span className="ml-2">· {source}</span>}
                    </div>
                    <div className="text-sm text-zinc-200 group-hover:text-amber-200 leading-snug">
                      {n.title}
                    </div>
                    {cleanSummary && (
                      <div className="text-xs text-zinc-500 mt-1 leading-snug line-clamp-2">
                        {cleanSummary}
                      </div>
                    )}
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <p className="text-[10px] font-mono leading-snug" style={{ color: 'color-mix(in srgb, var(--vmy-bone) 30%, transparent)' }}>
        Energy data: <a className="underline" href="https://github.com/owid/energy-data" target="_blank" rel="noopener noreferrer">Our World in Data</a> (CC BY 4.0).
        {data.timeseries.oilPrices.months.length > 0 && (
          <> Retail fuel prices: <a className="underline" href="https://www.iea.org/data-and-statistics/data-product/monthly-oil-price-statistics-2" target="_blank" rel="noopener noreferrer">IEA Monthly Oil Prices</a>.</>
        )}
      </p>
    </>
  )
}

function Tiles({ latest }: { latest: IeaCountryProfile['latest'] }) {
  const tiles: { label: string; indicator: string; format: (v: number) => string; suffix?: string }[] = [
    {
      label: 'Energy use / person',
      indicator: 'energy_per_capita_kwh',
      format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toString()),
      suffix: 'kWh',
    },
    {
      label: 'GHG from energy',
      indicator: 'ghg_from_energy_mt',
      format: (v) =>
        v >= 1000 ? `${(v / 1000).toFixed(2)}` : v >= 10 ? Math.round(v).toString() : v.toFixed(1),
      suffix: 'Mt CO₂e',
    },
    {
      label: 'Renewables share',
      indicator: 'renewables_share_energy',
      format: (v) => v.toFixed(1),
      suffix: '%',
    },
    {
      label: 'Electricity demand',
      indicator: 'electricity_demand_twh',
      format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)}k` : Math.round(v).toString()),
      suffix: 'TWh',
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-2">
      {tiles.map((t) => {
        const cell = latest[t.indicator]
        return (
          <div
            key={t.indicator}
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
              {t.label}
            </div>
            {cell == null ? (
              <div className="text-base mt-1" style={{ color: 'color-mix(in srgb, var(--vmy-bone) 30%, transparent)' }}>—</div>
            ) : (
              <>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-lg leading-none" style={{ color: 'var(--vmy-bone)', fontWeight: 500 }}>
                    {t.format(cell.value)}
                  </span>
                  {t.suffix && (
                    <span className="text-[10px] font-mono" style={{ color: 'color-mix(in srgb, var(--vmy-bone) 50%, transparent)' }}>
                      {t.suffix}
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-mono mt-0.5" style={{ color: 'color-mix(in srgb, var(--vmy-bone) 35%, transparent)' }}>
                  {cell.year}
                </div>
              </>
            )}
          </div>
        )
      })}
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
        <p className="text-[10px] font-mono" style={{ color: 'color-mix(in srgb, var(--vmy-bone) 45%, transparent)' }}>
          {subtitle}
        </p>
      </div>
      {children}
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="h-[160px] flex items-center justify-center text-[10px] font-mono text-zinc-600">
      No data
    </div>
  )
}

// Google News RSS descriptions arrive as: `<a href="...">{title}</a>&nbsp;&nbsp;<font color="#6f6f6f">{source}</font>`.
// We render the source name as part of the date row, and only show the
// stripped summary when it carries content beyond the title.
function extractNewsSource(html: string | null): string | null {
  if (!html) return null
  const m = html.match(/<font[^>]*>([^<]+)<\/font>/i)
  return m?.[1]?.trim() || null
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanNewsSummary(summary: string | null, title: string): string | null {
  if (!summary) return null
  const stripped = stripHtml(summary)
  if (!stripped) return null
  // Drop if it just repeats the title (modulo punctuation/whitespace) — the
  // Google News RSS shape often duplicates the title.
  const norm = (s: string) => s.toLowerCase().replace(/[^\w]+/g, '')
  if (norm(stripped).startsWith(norm(title))) return null
  return stripped
}
