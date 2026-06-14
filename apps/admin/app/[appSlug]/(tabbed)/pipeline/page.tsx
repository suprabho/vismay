import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import {
  fetchFootshortsPipelineStats,
  type PipelineStats,
  type PublisherStat,
  type PipelineDayPoint,
  type PipelineTopEntity,
} from '@vismay/content-source/footshortsData'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Tone = 'default' | 'warn' | 'ok'

function Stat({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: Tone }) {
  const color = tone === 'warn' ? 'text-amber-400' : tone === 'ok' ? 'text-sky-400' : 'text-white'
  return (
    <div className="mb-2 mr-2 min-w-[110px] rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  )
}

function freshnessTone(mins: number | null): Tone {
  if (mins == null) return 'default'
  if (mins > 120) return 'warn'
  return 'ok'
}

function formatMins(m: number | null): string {
  if (m == null) return '—'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

function BarByDay({ data }: { data: PipelineDayPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div className="flex h-20 items-end">
      {data.map((d) => {
        const h = (d.count / max) * 70
        return (
          <div key={d.day} className="flex flex-1 flex-col items-center">
            <div
              className="w-2 rounded-sm bg-sky-400"
              style={{ height: h, opacity: d.count > 0 ? 1 : 0.15 }}
            />
            <span className="mt-0.5 text-[8px] text-neutral-500">{d.day.slice(5)}</span>
          </div>
        )
      })}
    </div>
  )
}

function PublisherRow({ s }: { s: PublisherStat }) {
  const failureRate = s.total > 0 ? (s.failed / s.total) * 100 : 0
  const imgRate = s.total > 0 ? (s.withImage / s.total) * 100 : 0
  const tagRate = s.total > 0 ? (s.withTags / s.total) * 100 : 0
  return (
    <div className="mb-2 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-white">{s.publisher}</span>
        <span className="text-xs text-neutral-500">{s.total} articles</span>
      </div>
      <div className="flex gap-4 text-xs text-neutral-400">
        <span>
          Fail <span className={failureRate > 10 ? 'text-amber-400' : 'text-white'}>{failureRate.toFixed(0)}%</span>
        </span>
        <span>
          Image <span className="text-white">{imgRate.toFixed(0)}%</span>
        </span>
        <span>
          Tagged <span className="text-white">{tagRate.toFixed(0)}%</span>
        </span>
      </div>
    </div>
  )
}

function TopEntityRow({ e }: { e: PipelineTopEntity }) {
  return (
    <div className="mb-2 mr-2 flex items-center rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
      {e.crest_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.crest_url} alt="" className="mr-2 h-[18px] w-[18px] object-contain" />
      ) : null}
      <span className="mr-2 text-sm text-white">{e.name}</span>
      <span className="text-xs text-neutral-500">{e.article_count}</span>
    </div>
  )
}

interface Props {
  params: Promise<{ appSlug: string }>
}

export default async function AppPipelinePage({ params }: Props) {
  const { appSlug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/pipeline`)

  let data: PipelineStats
  try {
    data = await fetchFootshortsPipelineStats()
  } catch (e) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center">
        <p className="mb-2 text-base text-white">Could not load stats</p>
        <p className="text-sm text-neutral-500">{e instanceof Error ? e.message : 'Unknown error'}</p>
      </div>
    )
  }

  const imgPct = data.articles.total ? Math.round((data.articles.withImage / data.articles.total) * 100) : 0
  const tagPct = data.articles.total ? Math.round((data.articles.withTags / data.articles.total) * 100) : 0

  return (
    <main className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-4 text-lg font-semibold text-white">Pipeline</h1>

        <h2 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Freshness</h2>
        <div className="mb-4 flex flex-wrap">
          <Stat
            label="Last ingest"
            value={`${formatMins(data.freshness.minutesSinceLatest)} ago`}
            tone={freshnessTone(data.freshness.minutesSinceLatest)}
          />
          <Stat label="Total articles" value={data.articles.total} />
        </div>

        <h2 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Articles</h2>
        <div className="mb-4 flex flex-wrap">
          <Stat label="Summarized" value={data.articles.summarized} tone="ok" />
          <Stat
            label="Failed"
            value={data.articles.failed}
            tone={data.articles.failed > 0 ? 'warn' : 'default'}
          />
          <Stat label="Pending" value={data.articles.pending} />
          <Stat label="With image" value={`${imgPct}%`} />
          <Stat label="Tagged" value={`${tagPct}%`} />
        </div>

        <h2 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Entities</h2>
        <div className="mb-4 flex flex-wrap">
          <Stat label="Leagues" value={data.entities.leagues} />
          <Stat label="Teams" value={data.entities.teams} />
          <Stat label="Players" value={data.entities.players} />
        </div>

        <h2 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Ingested · last 14 days</h2>
        <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.02] p-4">
          <BarByDay data={data.byDay} />
        </div>

        <h2 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">By publisher</h2>
        {data.byPublisher.map((s) => (
          <PublisherRow key={s.publisher} s={s} />
        ))}

        <h2 className="mb-2 mt-4 text-xs uppercase tracking-wide text-neutral-500">Top tagged entities</h2>
        <div className="flex flex-wrap">
          {data.topEntities.map((e) => (
            <TopEntityRow key={e.entity_id} e={e} />
          ))}
          {data.topEntities.length === 0 ? (
            <p className="text-sm text-neutral-500">No tags yet — run the ingest worker.</p>
          ) : null}
        </div>
      </div>
    </main>
  )
}
