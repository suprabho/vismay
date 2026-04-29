'use client';

import {
  useAdminStats,
  type DayPoint,
  type PublisherStat,
  type TopEntity,
} from '@/lib/useAdminStats';

type Tone = 'default' | 'warn' | 'ok';

function Stat({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: Tone }) {
  const color = tone === 'warn' ? 'text-amber-400' : tone === 'ok' ? 'text-accent' : 'text-text';
  return (
    <div className="mb-2 mr-2 min-w-[110px] rounded-lg border border-border bg-surface px-4 py-3">
      <div className="mb-1 text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function freshnessTone(mins: number | null): Tone {
  if (mins == null) return 'default';
  if (mins > 120) return 'warn';
  return 'ok';
}

function formatMins(m: number | null): string {
  if (m == null) return '—';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function BarByDay({ data }: { data: DayPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex h-20 items-end">
      {data.map((d) => {
        const h = (d.count / max) * 70;
        return (
          <div key={d.day} className="flex flex-1 flex-col items-center">
            <div
              className="w-2 rounded-sm bg-accent"
              style={{ height: h, opacity: d.count > 0 ? 1 : 0.15 }}
            />
            <span className="mt-0.5 text-[8px] text-muted">{d.day.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

function PublisherRow({ s }: { s: PublisherStat }) {
  const failureRate = s.total > 0 ? (s.failed / s.total) * 100 : 0;
  const imgRate = s.total > 0 ? (s.withImage / s.total) * 100 : 0;
  const tagRate = s.total > 0 ? (s.withTags / s.total) * 100 : 0;
  return (
    <div className="mb-2 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-text">{s.publisher}</span>
        <span className="text-xs text-muted">{s.total} articles</span>
      </div>
      <div className="flex gap-4 text-xs text-muted">
        <span>
          Fail{' '}
          <span className={failureRate > 10 ? 'text-amber-400' : 'text-text'}>
            {failureRate.toFixed(0)}%
          </span>
        </span>
        <span>
          Image <span className="text-text">{imgRate.toFixed(0)}%</span>
        </span>
        <span>
          Tagged <span className="text-text">{tagRate.toFixed(0)}%</span>
        </span>
      </div>
    </div>
  );
}

function TopEntityRow({ e }: { e: TopEntity }) {
  return (
    <div className="mb-2 mr-2 flex items-center rounded-lg border border-border bg-surface px-3 py-2">
      {e.crest_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.crest_url} alt="" className="mr-2 h-[18px] w-[18px] object-contain" />
      ) : null}
      <span className="mr-2 text-sm text-text">{e.name}</span>
      <span className="text-xs text-muted">{e.article_count}</span>
    </div>
  );
}

export default function AdminPage() {
  const { data, isLoading, error, refetch, isFetching } = useAdminStats();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center">
        <p className="mb-2 text-base text-text">Could not load stats</p>
        <p className="text-sm text-muted">{(error as Error)?.message ?? 'Unknown error'}</p>
      </div>
    );
  }

  const imgPct = data.articles.total
    ? Math.round((data.articles.withImage / data.articles.total) * 100)
    : 0;
  const tagPct = data.articles.total
    ? Math.round((data.articles.withTags / data.articles.total) * 100)
    : 0;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text">Pipeline</h1>
        <button
          type="button"
          onClick={() => refetch()}
          aria-label="Refresh"
          className="text-sm text-muted hover:text-text"
        >
          {isFetching ? '…' : '↻'}
        </button>
      </div>

      <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">Freshness</h2>
      <div className="mb-4 flex flex-wrap">
        <Stat
          label="Last ingest"
          value={`${formatMins(data.freshness.minutesSinceLatest)} ago`}
          tone={freshnessTone(data.freshness.minutesSinceLatest)}
        />
        <Stat label="Total articles" value={data.articles.total} />
      </div>

      <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">Articles</h2>
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

      <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">Entities</h2>
      <div className="mb-4 flex flex-wrap">
        <Stat label="Leagues" value={data.entities.leagues} />
        <Stat label="Teams" value={data.entities.teams} />
        <Stat label="Players" value={data.entities.players} />
      </div>

      <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">Ingested · last 14 days</h2>
      <div className="mb-4 rounded-lg border border-border bg-surface p-4">
        <BarByDay data={data.byDay} />
      </div>

      <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">By publisher</h2>
      {data.byPublisher.map((s) => (
        <PublisherRow key={s.publisher} s={s} />
      ))}

      <h2 className="mb-2 mt-4 text-xs uppercase tracking-wide text-muted">Top tagged entities</h2>
      <div className="flex flex-wrap">
        {data.topEntities.map((e) => (
          <TopEntityRow key={e.entity_id} e={e} />
        ))}
        {data.topEntities.length === 0 ? (
          <p className="text-sm text-muted">No tags yet — run the ingest worker.</p>
        ) : null}
      </div>
    </main>
  );
}
