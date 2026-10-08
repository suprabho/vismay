import type { Metadata } from 'next'
import Link from 'next/link'
import { EditorialGrid, type Story } from '@/components/EditorialGrid'
import { MarginHero, MarginSpark } from '@/components/MarginChart'
import { DiffBars, WinsBars } from '@/components/StandingsCharts'
import { espnNews, standings } from '@/lib/espn'
import { recentRecaps } from '@/lib/feed'
import { getPrefs } from '@/lib/prefs'
import { ago, dayMonth, dayKey, ET, todayKey } from '@/lib/time'

export const metadata: Metadata = { title: 'Editorial' }
export const dynamic = 'force-dynamic'

/** "2026–27": a season starts in October and is labelled by both years. */
function seasonLabel(): string {
  const today = todayKey(ET)
  const y = Number(today.slice(0, 4))
  const start = Number(today.slice(5, 7)) >= 9 ? y : y - 1
  return `${start}–${String(start + 1).slice(2)}`
}

function Img({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- remote ESPN images of unknown host
  return <img src={src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
}

export default async function EditorialPage() {
  const { followed, tz } = await getPrefs()
  const [table, recaps, news] = await Promise.all([standings(), recentRecaps(12), espnNews(50)])
  const all = table?.conferences.flatMap((c) => c.rows) ?? []
  const mine = new Set(followed.map((t) => t.id))

  const epics = table
    ? [
        {
          href: '/editorial/standings#tracker',
          title: 'Season Tracker',
          dek: `Point differential, all ${all.length} teams · ${table.season}`,
          chart: <DiffBars rows={all} highlight={mine} />,
        },
        ...table.conferences.map((c) => ({
          href: `/editorial/standings#${c.name.split(' ')[0].toLowerCase()}`,
          title: c.name.replace(' Conference', ''),
          dek: `${c.rows[0]?.team.name ?? ''} lead · ${c.rows[0]?.wins ?? 0}–${c.rows[0]?.losses ?? 0}`,
          chart: <WinsBars rows={c.rows} />,
        })),
      ]
    : []

  const stories: Story[] = []
  for (const r of recaps) {
    const d = r.game!.detail
    const g = d.game
    const winner = (g.home.score ?? 0) >= (g.away.score ?? 0) ? g.home : g.away
    stories.push({
      id: r.id,
      kind: 'recap',
      kicker: `RECAP · ${g.away.team.abbr} ${g.away.score}–${g.home.score} ${g.home.team.abbr}`,
      title: r.headline,
      dek: r.body,
      byline: `ESPN · ${dayMonth(dayKey(g.date, tz))}`,
      href: `/game/${g.id}`,
      external: false,
      accent: winner.team.dot,
      thumb:
        stories.length === 0 ? (
          <MarginHero detail={d} run={r.game!.run} height={220} />
        ) : (
          <MarginSpark
            detail={d}
            perspective={winner.homeAway}
            color={winner.team.dot}
            width={116}
            height={88}
            quarters={false}
            className="h-[88px] w-[116px]"
          />
        ),
    })
  }
  if (table) {
    stories.push({
      id: 'board-standings',
      kind: 'board',
      kicker: 'BOARD',
      title: `Standings by point differential, ${table.season}`,
      dek: null,
      byline: null,
      href: '/editorial/standings',
      external: false,
      thumb: (
        <div className="w-[150px]">
          <DiffBars rows={all} height={80} highlight={mine} />
        </div>
      ),
    })
  }
  for (const n of news) {
    stories.push({
      id: n.id,
      kind: n.kind === 'feature' ? 'feature' : n.kind === 'recap' ? 'recap' : 'news',
      kicker: `${n.kind === 'feature' ? 'FEATURE' : 'NEWS'} · ${ago(n.published).toUpperCase()}`,
      title: n.headline,
      dek: n.body,
      byline: `ESPN · ${dayMonth(dayKey(n.published, tz))}`,
      href: n.url ?? '#',
      external: true,
      thumb: n.image ? <Img src={n.image} /> : null,
    })
  }
  // Features lead the grid when there's no recap to open on.
  stories.sort((a, b) => {
    const rank = (s: Story) => (s.kind === 'recap' ? 0 : s.kind === 'feature' ? 1 : s.kind === 'board' ? 2 : 3)
    return rank(a) - rank(b)
  })

  return (
    <main>
      <div className="px-4 pt-[22px] pb-1.5">
        <p className="font-mono text-[10.5px] font-bold tracking-[0.14em] text-accent">EDITORIAL · {seasonLabel()}</p>
        <h1 className="mt-2 text-4xl leading-[0.98] font-bold tracking-[-0.025em] [font-stretch:72%]">
          The season, read through its numbers.
        </h1>
        <p className="mt-2.5 text-[13.5px] leading-normal text-dim">Recaps, boards and features from around the league.</p>
      </div>

      {epics.length > 0 && (
        <div className="pt-[18px]">
          <div className="flex items-baseline justify-between px-4 pb-2.5">
            <h2 className="text-[15px] font-semibold">Epics</h2>
            <span className="text-[11px] text-muted">Series that update all season</span>
          </div>
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4 pb-1">
            {epics.map((e) => (
              <Link
                key={e.href}
                href={e.href}
                className="flex w-[228px] flex-none flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3.5"
              >
                {e.chart}
                <div>
                  <div className="text-[15px] leading-[1.2] font-semibold">{e.title}</div>
                  <div className="mt-[3px] text-[11.5px] text-muted">{e.dek}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <EditorialGrid stories={stories} />
    </main>
  )
}
