'use client'

import { useEffect, useState } from 'react'
import DetailSheet from '@/components/DetailSheet'
import TimelineChart from '@/components/ai-data-centers/charts/TimelineChart'
import { DC_METRIC_COLORS } from '@/components/ai-data-centers/charts/colors'
import type { DcFacilityProfile, DcMetricKey } from '@vismay/content-source/epics'

interface Props {
  slug: string
  onClose: () => void
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: DcFacilityProfile }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

export function formatPowerMw(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)} GW` : `${Math.round(v)} MW`
}

export function formatH100e(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`
  return Math.round(v).toString()
}

export function formatCapexBn(v: number): string {
  return `$${v >= 10 ? Math.round(v) : v.toFixed(1)}B`
}

const METRIC_CHARTS: {
  key: DcMetricKey
  title: string
  subtitle: string
  format: (v: number) => string
}[] = [
  { key: 'power_mw', title: 'Power capacity', subtitle: 'Megawatts over time', format: formatPowerMw },
  { key: 'h100_equivalents', title: 'Compute', subtitle: 'H100-equivalent GPUs over time', format: formatH100e },
  { key: 'capex_usd_bn', title: 'Capital cost', subtitle: 'Cumulative, 2025 USD billions', format: formatCapexBn },
]

export default function AiDataCenterDetail({ slug, onClose }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    fetch(`/api/ai-data-centers/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        if (r.status === 404) {
          if (!cancelled) setState({ kind: 'missing' })
          return
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = (await r.json()) as DcFacilityProfile
        if (!cancelled) setState({ kind: 'ready', data })
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: 'error', message: String(err) })
      })
    return () => { cancelled = true }
  }, [slug])

  return (
    <DetailSheet>
      <Header title={state.kind === 'ready' ? state.data.name : slug} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
        {state.kind === 'loading' && (
          <p className="text-xs font-mono text-zinc-500 mt-3">Loading facility…</p>
        )}
        {state.kind === 'error' && (
          <p className="text-xs font-mono text-rose-400 mt-3">Failed to load: {state.message}</p>
        )}
        {state.kind === 'missing' && (
          <p className="text-xs font-mono text-zinc-500 mt-3">No data for this facility yet.</p>
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
          Data center
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

function Profile({ data }: { data: DcFacilityProfile }) {
  const facts: { label: string; value: string | null }[] = [
    { label: 'Owner', value: data.owner },
    { label: 'Users', value: data.users },
    { label: 'Project', value: data.project },
    { label: 'Location', value: [data.address, data.country].filter(Boolean).join(', ') || null },
    { label: 'Investors', value: data.investors },
    { label: 'Energy companies', value: data.energyCompanies },
  ]

  return (
    <>
      <Tiles data={data} />

      <dl className="space-y-1.5">
        {facts
          .filter((f) => f.value)
          .map((f) => (
            <div key={f.label} className="flex gap-2 text-xs">
              <dt
                className="w-28 shrink-0 font-mono uppercase tracking-wider text-[10px] pt-0.5"
                style={{ color: 'color-mix(in srgb, var(--vmy-bone) 45%, transparent)' }}
              >
                {f.label}
              </dt>
              <dd style={{ color: 'color-mix(in srgb, var(--vmy-bone) 85%, transparent)' }}>
                {f.value}
              </dd>
            </div>
          ))}
      </dl>

      {METRIC_CHARTS.map((m) => {
        const series = data.timeline.find((s) => s.metric === m.key)
        if (!series || series.points.length < 2) return null
        return (
          <ChartBlock key={m.key} title={m.title} subtitle={m.subtitle}>
            <TimelineChart
              points={series.points}
              color={DC_METRIC_COLORS[m.key]}
              valueFormatter={m.format}
            />
          </ChartBlock>
        )
      })}

      {data.notes && (
        <p
          className="text-xs leading-relaxed"
          style={{ color: 'color-mix(in srgb, var(--vmy-bone) 60%, transparent)' }}
        >
          {data.notes}
        </p>
      )}

      <p
        className="text-[10px] font-mono leading-snug"
        style={{ color: 'color-mix(in srgb, var(--vmy-bone) 30%, transparent)' }}
      >
        Data:{' '}
        <a
          className="underline"
          href="https://epoch.ai/data/ai-data-centers"
          target="_blank"
          rel="noopener noreferrer"
        >
          Epoch AI, Frontier Data Centers
        </a>{' '}
        (CC BY 4.0).
      </p>
    </>
  )
}

function Tiles({ data }: { data: DcFacilityProfile }) {
  const tiles: { label: string; value: string | null }[] = [
    { label: 'Power capacity', value: data.powerMw != null ? formatPowerMw(data.powerMw) : null },
    { label: 'H100 equivalents', value: data.h100Equivalents != null ? formatH100e(data.h100Equivalents) : null },
    { label: 'Capital cost', value: data.capexUsdBn != null ? formatCapexBn(data.capexUsdBn) : null },
    { label: 'Country', value: data.country },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 mt-3">
      {tiles.map((t) => (
        <div
          key={t.label}
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
          <div
            className="text-lg leading-none mt-1"
            style={{
              color: t.value ? 'var(--vmy-bone)' : 'color-mix(in srgb, var(--vmy-bone) 30%, transparent)',
              fontWeight: 500,
            }}
          >
            {t.value ?? '—'}
          </div>
        </div>
      ))}
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
