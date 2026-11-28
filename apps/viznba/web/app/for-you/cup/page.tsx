import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { TableSwitch } from '@/components/StandingsTabs'
import { FavStar, TeamBadge } from '@/components/ui'
import { cupStandings, type StandingRow } from '@/lib/espn'
import { getPrefs } from '@/lib/prefs'
import { confKey, confLabel, signed } from '@/lib/standings'

export const metadata: Metadata = {
  title: 'NBA Cup standings: group tables',
  description: 'All six NBA Cup groups, East and West: games played, record, points for and against, and point differential.',
  alternates: { canonical: '/for-you/cup' },
}
export const dynamic = 'force-dynamic'

const COLS = { gridTemplateColumns: '12px 22px minmax(0,1fr) 18px 18px 18px 30px 30px 30px' }
const HEAD = ['GP', 'W', 'L', 'Pts+', 'Pts-', 'Diff']

export default async function CupPage() {
  const [table, { followed }] = await Promise.all([cupStandings(), getPrefs()])
  if (!table) notFound()
  const mine = new Set(followed.map((t) => t.id))
  const conferences = [...table.conferences].sort(
    (a, b) => (confKey(a.name) === 'west' ? -1 : 1) - (confKey(b.name) === 'west' ? -1 : 1),
  )

  return (
    <main className="flex flex-col gap-4 px-4 pt-[22px] pb-10">
      <div>
        <p className="font-mono text-[10.5px] font-bold tracking-[0.14em] text-accent">NBA CUP · {table.season}</p>
        <h1 className="mt-2 text-4xl leading-[0.98] font-bold tracking-[-0.025em] [font-stretch:72%]">Group tables</h1>
        <p className="mt-2.5 text-[13.5px] leading-normal text-dim">
          {table.started
            ? 'Cup group games only. Each group winner and one wild card per conference reach the quarterfinals.'
            : 'Group play has not started yet. Each group winner and one wild card per conference reach the quarterfinals.'}
        </p>
      </div>
      <TableSwitch active="cup" />

      {conferences.flatMap((c) =>
        c.groups.map((g) => (
          <Group key={`${c.name}-${g.name}`} name={`${confLabel(c.name).replace('ern', '')} ${g.name}`} rows={g.rows} mine={mine} />
        )),
      )}
      <p className="text-[10.5px] text-faint">
        Orange bar: won the group. Dimmed: eliminated. Pts+ and Pts- are total points scored and allowed. Ties are broken by head-to-head, then point differential. Updated
        every 15 minutes from ESPN.
      </p>
    </main>
  )
}

function Group({ name, rows, mine }: { name: string; rows: StandingRow[]; mine: Set<string> }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-3.5">
      <h2 className="mb-1 text-[15px] font-semibold">{name}</h2>
      <div className="grid gap-x-1.5 font-mono text-[12px]" style={COLS}>
        <span className="col-span-3 py-1.5 font-sans text-[10.5px] text-muted">Team</span>
        {HEAD.map((h) => (
          <span key={h} className="py-1.5 text-right text-[10.5px] text-muted">
            {h}
          </span>
        ))}
        {rows.map((r, i) => {
          const out = r.clinch === 'out'
          return (
            <div
              key={r.team.id}
              className="relative col-span-9 grid min-h-11 items-center gap-x-1.5 border-t border-border"
              style={{ gridTemplateColumns: 'subgrid' }}
            >
              {r.clinch === 'in' && <span aria-hidden="true" className="absolute top-1.5 bottom-1.5 -left-3.5 w-[3px] rounded-r bg-accent" />}
              <span className="text-muted">{r.seed || i + 1}</span>
              <span className={out ? 'opacity-55' : ''}>
                <TeamBadge team={r.team} size={22} outlined={false} />
              </span>
              <span
                className={`flex min-w-0 items-center gap-1.5 font-sans text-[14px] ${mine.has(r.team.id) ? 'font-bold' : 'font-medium'} ${
                  out ? 'text-muted' : ''
                }`}
              >
                <span className="truncate">{r.team.name}</span>
                {mine.has(r.team.id) && <FavStar size={11} />}
                {r.clinch === 'in' && <span className="sr-only">, won the group</span>}
                {out && <span className="sr-only">, eliminated</span>}
              </span>
              <span className={`text-right ${out ? 'text-muted' : ''}`}>{r.wins + r.losses}</span>
              <span className={`text-right ${out ? 'text-muted' : ''}`}>{r.wins}</span>
              <span className={`text-right ${out ? 'text-muted' : ''}`}>{r.losses}</span>
              <span className="text-right text-muted">{r.pf}</span>
              <span className="text-right text-muted">{r.pa}</span>
              <span className={`text-right ${out ? 'text-muted' : ''}`}>{signed(r.pointDiff)}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
