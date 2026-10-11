import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { TeamBadge } from '@/components/ui'
import { standings, type StandingRow } from '@/lib/espn'
import { getPrefs } from '@/lib/prefs'

export const metadata: Metadata = { title: 'Season Tracker' }
export const dynamic = 'force-dynamic'

export default async function StandingsPage() {
  const [table, { followed }] = await Promise.all([standings(), getPrefs()])
  if (!table) notFound()
  const mine = new Set(followed.map((t) => t.id))
  const all = table.conferences.flatMap((c) => c.rows).sort((a, b) => b.diff - a.diff)
  const peak = Math.max(1, ...all.map((r) => Math.abs(r.diff)))

  return (
    <main className="flex flex-col gap-4 px-4 pt-[22px] pb-10">
      <div>
        <p className="font-mono text-[10.5px] font-bold tracking-[0.14em] text-accent">EPIC · {table.season}</p>
        <h1 className="mt-2 text-4xl leading-[0.98] font-bold tracking-[-0.025em] [font-stretch:72%]">Season Tracker</h1>
        <p className="mt-2.5 text-[13.5px] leading-normal text-dim">
          Average point differential per game for every team, then the two conference tables. Updated hourly from ESPN.
        </p>
      </div>

      <section id="tracker" className="scroll-mt-16 rounded-2xl border border-border bg-surface p-3.5">
        <h2 className="mb-3 text-[15px] font-semibold">Point differential per game</h2>
        <ol className="flex flex-col gap-1">
          {all.map((r) => {
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
                <span className="text-right font-mono text-[11px]">{r.diff > 0 ? `+${r.diff.toFixed(1)}` : r.diff.toFixed(1)}</span>
              </li>
            )
          })}
        </ol>
      </section>

      {table.conferences.map((c) => (
        <Conference key={c.name} name={c.name} rows={c.rows} mine={mine} />
      ))}
    </main>
  )
}

function Conference({ name, rows, mine }: { name: string; rows: StandingRow[]; mine: Set<string> }) {
  return (
    <section id={name.split(' ')[0].toLowerCase()} className="scroll-mt-16 rounded-2xl border border-border bg-surface p-3.5">
      <h2 className="mb-2 text-[15px] font-semibold">{name}</h2>
      <div className="grid gap-x-2 font-mono text-[11px]" style={{ gridTemplateColumns: '18px 26px minmax(0,1fr) 44px 34px 40px' }}>
        <span className="col-span-3 pb-1.5 font-sans text-[10px] text-muted">Team</span>
        <span className="pb-1.5 text-right text-[10px] text-muted">W–L</span>
        <span className="pb-1.5 text-right text-[10px] text-muted">GB</span>
        <span className="pb-1.5 text-right text-[10px] text-muted">L10</span>
        {rows.map((r, i) => (
          <div
            key={r.team.id}
            className={`col-span-6 grid items-center gap-x-2 py-1.5 ${i === 6 || i === 10 ? 'border-t border-dashed border-border-strong' : 'border-t border-border'}`}
            style={{ gridTemplateColumns: 'subgrid' }}
          >
            <span className="text-muted">{r.seed || i + 1}</span>
            <TeamBadge team={r.team} size={22} outlined={false} />
            <span className={`truncate font-sans text-[13px] ${mine.has(r.team.id) ? 'font-bold' : 'font-medium'}`}>{r.team.name}</span>
            <span className="text-right">
              {r.wins}–{r.losses}
            </span>
            <span className="text-right text-muted">{r.gb}</span>
            <span className="text-right text-muted">{r.lastTen}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10.5px] text-faint">Dashed lines: top six go straight to the playoffs, 7–10 to the play-in.</p>
    </section>
  )
}
