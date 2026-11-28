import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Tabs, TableSwitch } from '@/components/StandingsTabs'
import { FavStar, TeamBadge } from '@/components/ui'
import { standings } from '@/lib/espn'
import { getPrefs } from '@/lib/prefs'
import { confKey, confLabel, pickConf, signed } from '@/lib/standings'

export const metadata: Metadata = {
  title: 'NBA standings: Western and Eastern Conference',
  description: 'Western and Eastern Conference tables with record, games behind and last ten, plus point differential for every team.',
  alternates: { canonical: '/for-you/standings' },
}
export const dynamic = 'force-dynamic'

const COLS = { gridTemplateColumns: '18px 26px minmax(0,1fr) 26px 26px 36px 38px' }

export default async function StandingsPage({ searchParams }: { searchParams: Promise<{ conf?: string }> }) {
  const [{ conf: asked }, table, { followed }] = await Promise.all([searchParams, standings(), getPrefs()])
  if (!table) notFound()
  const mine = new Set(followed.map((t) => t.id))
  const active = pickConf(table, asked, followed)
  const conf = table.conferences.find((c) => confKey(c.name) === active) ?? table.conferences[0]
  const byDiff = [...conf.rows].sort((a, b) => b.diff - a.diff)
  const peak = Math.max(1, ...table.conferences.flatMap((c) => c.rows).map((r) => Math.abs(r.diff)))
  // West first, as the tabs read left to right.
  const tabs = [...table.conferences]
    .sort((a, b) => (confKey(a.name) === 'west' ? -1 : 1) - (confKey(b.name) === 'west' ? -1 : 1))
    .map((c) => ({
      href: `/for-you/standings?conf=${confKey(c.name)}`,
      label: c.name,
      active: confKey(c.name) === active,
    }))

  return (
    <main className="flex flex-col gap-4 px-4 pt-[22px] pb-10">
      <div>
        <p className="font-mono text-[10.5px] font-bold tracking-[0.14em] text-accent">NBA · {table.season}</p>
        <h1 className="mt-2 text-4xl leading-[0.98] font-bold tracking-[-0.025em] [font-stretch:72%]">Standings</h1>
      </div>
      <TableSwitch active="nba" />

      <section className="rounded-2xl border border-border bg-surface px-3.5 pb-3.5">
        <Tabs label="Conference" tabs={tabs} />
        <div className="mt-2 grid gap-x-2 font-mono text-[12px]" style={COLS}>
          <span className="col-span-3 py-1.5 font-sans text-[10.5px] text-muted">Team</span>
          <span className="py-1.5 text-right text-[10.5px] text-muted">W</span>
          <span className="py-1.5 text-right text-[10.5px] text-muted">L</span>
          <span className="py-1.5 text-right text-[10.5px] text-muted">GB</span>
          <span className="py-1.5 text-right text-[10.5px] text-muted">L10</span>
          {conf.rows.map((r, i) => (
            <div
              key={r.team.id}
              className={`col-span-7 grid min-h-11 items-center gap-x-2 border-t ${
                i === 6 || i === 10 ? 'border-dashed border-border-strong' : 'border-border'
              }`}
              style={{ gridTemplateColumns: 'subgrid' }}
            >
              <span className="text-muted">{r.seed || i + 1}</span>
              <TeamBadge team={r.team} size={26} outlined={false} />
              <span className={`flex min-w-0 items-center gap-1.5 font-sans text-[14px] ${mine.has(r.team.id) ? 'font-bold' : 'font-medium'}`}>
                <span className="truncate">{r.team.name}</span>
                {mine.has(r.team.id) && <FavStar size={11} />}
              </span>
              <span className="text-right">{r.wins}</span>
              <span className="text-right">{r.losses}</span>
              <span className="text-right text-muted">{r.gb}</span>
              <span className="text-right text-muted">{r.lastTen}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10.5px] text-faint">Dashed lines: top six go straight to the playoffs, 7–10 to the play-in.</p>
      </section>

      <section id="tracker" className="scroll-mt-16 rounded-2xl border border-border bg-surface p-3.5">
        <h2 className="mb-3 text-[15px] font-semibold">Point differential per game · {confLabel(conf.name)}</h2>
        <ol className="flex flex-col gap-1">
          {byDiff.map((r) => {
            const w = (Math.abs(r.diff) / peak) * 50
            const color = mine.has(r.team.id) ? r.team.dot : r.diff >= 0 ? 'var(--color-accent)' : 'var(--color-slate-600)'
            return (
              <li key={r.team.id} className="grid items-center gap-2" style={{ gridTemplateColumns: '36px minmax(0,1fr) 44px' }}>
                <span className={`font-mono text-[10.5px] ${mine.has(r.team.id) ? 'font-bold text-text' : 'text-muted'}`}>{r.team.abbr}</span>
                <span className="relative h-2.5">
                  <span className="absolute top-0 left-1/2 h-full w-px bg-border-strong" />
                  <span
                    className="absolute top-0 h-full rounded-sm"
                    style={{ background: color, width: `${w}%`, left: r.diff >= 0 ? '50%' : `${50 - w}%` }}
                  />
                </span>
                <span className="text-right font-mono text-[11px]">{signed(r.diff, 1)}</span>
              </li>
            )
          })}
        </ol>
      </section>
      <p className="text-[10.5px] text-faint">Updated hourly from ESPN.</p>
    </main>
  )
}
