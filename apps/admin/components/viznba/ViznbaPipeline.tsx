import { WorkersPanel } from '@/components/footshorts/WorkersPanel'
import { fetchViznbaPipelineStats, type ViznbaPipelineStats, type ViznbaTopEntity } from '@vismay/content-source/viznbaData'

/**
 * The VizNBA Pipeline tab (/viznba/pipeline): the news worker's two GitHub
 * Actions (ingest every 4h, the weekly roster seed) with their last runs and
 * a trigger, then the viznba_ tables read back: freshness, the last 24h of
 * ingestion by status, what the app's Feed can see, the roster the tagger
 * resolves against, tagging coverage, topics, sources, failures and the
 * most-tagged teams and people. Server component; the stats come from
 * @vismay/content-source/viznbaData.
 */

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

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">{children}</h2>
}

function formatMins(m: number | null): string {
  if (m == null) return '—'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

/** The ingest runs every 4h: past 6h without a new row is worth a look. */
function freshnessTone(mins: number | null, warnAfter = 6 * 60): Tone {
  if (mins == null) return 'default'
  return mins > warnAfter ? 'warn' : 'ok'
}

function pct(n: number, of: number): string {
  return of ? `${Math.round((n / of) * 100)}%` : '—'
}

const TOPIC_LABEL: Record<string, string> = {
  game: 'Game',
  transaction: 'Transaction',
  injury: 'Injury',
  draft: 'Draft',
  front_office: 'Front office',
  league: 'League',
  analysis: 'Analysis',
  off_court: 'Off court',
  other_basketball: 'Other basketball',
  other_sport: 'Other sport',
  betting_fantasy: 'Betting / fantasy',
  unrelated: 'Unrelated',
}

function ByDay({ data }: { data: ViznbaPipelineStats['byDay'] }) {
  const max = Math.max(1, ...data.map((d) => d.ingested))
  return (
    <div className="flex h-24 items-end gap-0.5">
      {data.map((d) => (
        <div key={d.day} className="flex flex-1 flex-col items-center" title={`${d.day}: ${d.ingested} ingested, ${d.summarized} summarized`}>
          <div className="relative w-2.5 rounded-sm bg-white/10" style={{ height: Math.max(2, (d.ingested / max) * 80) }}>
            <div className="absolute inset-x-0 bottom-0 rounded-sm bg-orange-400" style={{ height: `${d.ingested ? (d.summarized / d.ingested) * 100 : 0}%` }} />
          </div>
          <span className="mt-0.5 text-[8px] text-neutral-500">{d.day.slice(5)}</span>
        </div>
      ))}
    </div>
  )
}

function EntityRow({ e }: { e: ViznbaTopEntity }) {
  return (
    <div className="mb-2 mr-2 flex items-center rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2" title={`Mean tag confidence ${e.confidence}`}>
      {e.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- ESPN logo / headshot CDN, 20px
        <img src={e.imageUrl} alt="" className={`mr-2 h-5 w-5 object-contain ${e.type === 'team' ? '' : 'rounded-full bg-white/5 object-cover'}`} />
      ) : null}
      <span className="mr-2 text-sm text-white">{e.name}</span>
      {e.type !== 'team' && e.team ? <span className="mr-2 text-[10px] uppercase tracking-wide text-neutral-500">{e.team}</span> : null}
      {e.type === 'coach' ? <span className="mr-2 text-[10px] uppercase tracking-wide text-neutral-500">coach</span> : null}
      <span className="text-xs text-neutral-500">{e.articles}</span>
    </div>
  )
}

/** Why the Feed has nothing new while the worker is green. */
function Diagnosis({ data }: { data: ViznbaPipelineStats }) {
  const d = data.feed.last24h
  let line: string | null = null
  if (data.roster.teams === 0) {
    line = 'viznba_teams is empty: the roster seed has never run, so nothing can be tagged. Trigger "Roster seed" above, then the ingest.'
  } else if (d.ingested === 0) {
    line = 'No articles were ingested in the last 24h: the ingest is running but not landing rows (every candidate already known, or every feed failing). Check the worker logs.'
  } else if (d.summarized === 0 && d.failed > 0) {
    line = `${d.failed} of ${d.ingested} articles ingested in the last 24h failed and none were summarized: the AI gateway (Jev classify + Claude Haiku) is rejecting the calls. Check AI_GATEWAY_API_KEY and the failure reasons below.`
  } else if (d.summarized === 0 && d.hidden > 0) {
    line = `${d.hidden} of ${d.ingested} articles ingested in the last 24h were hidden as not-NBA and none were summarized: the topic classifier is rejecting everything.`
  } else if (d.summarized === 0 && d.pending > 0) {
    line = `${d.pending} of ${d.ingested} articles ingested in the last 24h are still pending: summarization never ran on them.`
  }
  if (!line) return null
  return (
    <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/[0.06] px-4 py-3">
      <div className="mb-1 text-sm font-semibold text-amber-300">The Feed is getting no new worker stories</div>
      <p className="text-sm text-neutral-300">{line}</p>
    </div>
  )
}

export async function ViznbaPipeline() {
  let data: ViznbaPipelineStats
  try {
    data = await fetchViznbaPipelineStats()
  } catch (e) {
    const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Unknown error'
    return (
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <h1 className="mb-4 text-lg font-semibold text-white">Pipeline</h1>
          <div className="mb-6">
            <WorkersPanel endpoint="/api/viznba/workers" />
          </div>
          <div className="rounded-lg border border-white/10 px-4 py-6 text-center">
            <p className="mb-2 text-base text-white">Could not load the VizNBA stats</p>
            <p className="text-sm text-neutral-500">{msg}</p>
            <p className="mt-2 text-xs text-neutral-600">Has supabase/viznba/migrations/001_init.sql been applied?</p>
          </div>
        </div>
      </main>
    )
  }

  const t = data.tagging
  const tagTotal = t.tags.team + t.tags.player + t.tags.coach

  return (
    <main className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-4 text-lg font-semibold text-white">Pipeline</h1>

        <div className="mb-6">
          <WorkersPanel endpoint="/api/viznba/workers" />
        </div>

        <Diagnosis data={data} />

        <H2>Freshness</H2>
        <div className="mb-4 flex flex-wrap">
          <Stat label="Last ingest" value={`${formatMins(data.freshness.minutesSinceLatest)} ago`} tone={freshnessTone(data.freshness.minutesSinceLatest)} />
          <Stat
            label="Newest in the Feed"
            value={`${formatMins(data.feed.minutesSinceLatest)} ago`}
            tone={freshnessTone(data.feed.minutesSinceLatest, 12 * 60)}
          />
          <Stat label="Total articles" value={data.articles.total} />
        </div>

        <H2>Ingested · last 24h</H2>
        <div className="mb-4 flex flex-wrap">
          <Stat label="Ingested" value={data.feed.last24h.ingested} />
          <Stat label="Summarized" value={data.feed.last24h.summarized} tone={data.feed.last24h.summarized > 0 ? 'ok' : 'warn'} />
          <Stat label="Hidden" value={data.feed.last24h.hidden} />
          <Stat label="Failed" value={data.feed.last24h.failed} tone={data.feed.last24h.failed > 0 ? 'warn' : 'default'} />
          <Stat label="Pending" value={data.feed.last24h.pending} />
        </div>

        <H2>Articles · all time</H2>
        <div className="mb-4 flex flex-wrap">
          <Stat label="Summarized" value={data.articles.summarized} tone="ok" />
          <Stat label="Hidden" value={data.articles.hidden} />
          <Stat label="Failed" value={data.articles.failed} tone={data.articles.failed > 0 ? 'warn' : 'default'} />
          <Stat label="Pending" value={data.articles.pending} />
        </div>

        <H2>Roster the tagger resolves against</H2>
        <div className="mb-4 flex flex-wrap">
          <Stat label="Teams" value={data.roster.teams} tone={data.roster.teams === 30 ? 'ok' : 'warn'} />
          <Stat label="Active players" value={data.roster.activePlayers} />
          <Stat label="Coaches" value={data.roster.coaches} />
          <Stat
            label="Last seeded"
            value={data.roster.minutesSinceSeed != null ? `${formatMins(data.roster.minutesSinceSeed)} ago` : 'never'}
            // The seed runs weekly: past 8 days it missed a Monday.
            tone={freshnessTone(data.roster.minutesSinceSeed ?? Infinity, 8 * 24 * 60)}
          />
        </div>

        <H2>Tagging · summarized, last {data.window.days} days</H2>
        <div className="mb-4 flex flex-wrap">
          <Stat label="Tagged" value={pct(t.tagged, t.summarized)} tone={t.summarized && t.tagged / t.summarized < 0.6 ? 'warn' : 'default'} />
          <Stat label="Tags per story" value={t.summarized ? (tagTotal / t.summarized).toFixed(1) : '—'} />
          <Stat label="Team tags" value={t.tags.team} />
          <Stat label="Player tags" value={t.tags.player} />
          <Stat label="Coach tags" value={t.tags.coach} />
        </div>

        <H2>Ingested · last {data.window.days} days (orange: summarized)</H2>
        <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.02] p-4">
          <ByDay data={data.byDay} />
        </div>

        <H2>Topics · last {data.window.days} days</H2>
        <div className="mb-4 flex flex-wrap gap-2">
          {data.byTopic.map((x) => (
            <span
              key={x.topic ?? 'none'}
              className={`rounded-full border px-2.5 py-1 text-xs ${x.nba ? 'border-white/15 text-neutral-200' : 'border-white/5 text-neutral-500'}`}
              title={x.nba ? 'NBA news: summarized and tagged' : 'Not NBA news: hidden by design'}
            >
              {TOPIC_LABEL[x.topic ?? ''] ?? x.topic ?? 'Unclassified'} <span className="font-mono tabular-nums text-orange-300/90">{x.count}</span>
            </span>
          ))}
          {data.byTopic.length === 0 ? <p className="text-sm text-neutral-500">Nothing classified in the window.</p> : null}
        </div>

        <H2>By source · last {data.window.days} days</H2>
        <div className="mb-4 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="font-mono text-[11px] uppercase tracking-wider text-neutral-500">
              <tr className="border-b border-white/5">
                <th className="px-3 py-2 text-left font-medium">Source</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-right font-medium">NBA</th>
                <th className="px-3 py-2 text-right font-medium">Hidden</th>
                <th className="px-3 py-2 text-right font-medium">Failed</th>
                <th className="px-3 py-2 text-right font-medium">Image</th>
                <th className="px-3 py-2 text-right font-medium">Tagged</th>
              </tr>
            </thead>
            <tbody>
              {data.bySource.map((s) => (
                <tr key={s.source} className="border-b border-white/5 last:border-0">
                  <td className="px-3 py-2">
                    <div className="text-neutral-200">{s.publisher}</div>
                    <div className="font-mono text-[11px] text-neutral-500">{s.source}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-neutral-300">{s.total}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-neutral-300">{pct(s.summarized, s.total)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-neutral-400">{s.hidden}</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums ${s.failed ? 'text-amber-400' : 'text-neutral-400'}`}>{s.failed}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-neutral-400">{pct(s.withImage, s.total)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-neutral-400">{pct(s.withTags, s.summarized)}</td>
                </tr>
              ))}
              {data.bySource.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-3 text-sm text-neutral-500">
                    Nothing ingested in the window. Run the news ingest.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {data.failures.length > 0 && (
          <>
            <H2>Failure reasons · last {data.window.days} days</H2>
            <ul className="mb-4 space-y-1.5">
              {data.failures.map((f) => (
                <li key={f.reason} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs">
                  <span className="font-mono tabular-nums text-amber-400">{f.count}</span>
                  <span className="break-words font-mono text-neutral-300">{f.reason}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <H2>Most-tagged teams · last {data.window.days} days</H2>
        <div className="mb-4 flex flex-wrap">
          {data.topTeams.map((e) => (
            <EntityRow key={e.id} e={e} />
          ))}
          {data.topTeams.length === 0 ? <p className="text-sm text-neutral-500">No team tags yet: seed the roster, then run the ingest.</p> : null}
        </div>

        <H2>Most-tagged people · last {data.window.days} days</H2>
        <div className="flex flex-wrap">
          {data.topPeople.map((e) => (
            <EntityRow key={`${e.type}:${e.id}`} e={e} />
          ))}
          {data.topPeople.length === 0 ? <p className="text-sm text-neutral-500">No player or coach tags yet.</p> : null}
        </div>
      </div>
    </main>
  )
}
