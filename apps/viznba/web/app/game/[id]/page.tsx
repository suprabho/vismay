import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AutoRefresh } from '@/components/AutoRefresh'
import { RemindButton } from '@/components/ForYouCards'
import { MarginHero } from '@/components/MarginChart'
import { FormChips, leader, Linescore, made, num, Pill, ScoreRow, StatBars, TeamBadge } from '@/components/ui'
import { gameDetail, type GameDetail, type Leader } from '@/lib/espn'
import { localDay, relativeDay, tipoff } from '@/lib/labels'
import { biggestRun } from '@/lib/margin'
import { getPrefs } from '@/lib/prefs'
import { countdown, todayKey } from '@/lib/time'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const d = await gameDetail(id)
  if (!d) return { title: 'Game' }
  const { away, home } = d.game
  return { title: `${away.team.abbr} @ ${home.team.abbr}` }
}

function periodLabel(p: number): string {
  return p <= 4 ? `Q${p}` : p === 5 ? 'OT' : `${p - 4}OT`
}

export default async function GamePage({ params }: Props) {
  const { id } = await params
  const { followed, tz } = await getPrefs()
  const first = await gameDetail(id, 20)
  if (!first) notFound()
  const detail: GameDetail = first
  const { game } = detail
  const ids = new Set(followed.map((t) => t.id))
  const lead = leader(game)
  const t = tipoff(game, tz)
  const run = game.state === 'pre' ? null : biggestRun(detail.margin)
  const { away: a, home: h } = detail.box

  return (
    <main className="flex flex-col gap-3 px-3 pt-4 pb-10">
      {game.state === 'in' && <AutoRefresh seconds={20} />}
      <section className="flex flex-col gap-3.5 rounded-[18px] border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          {game.state === 'in' ? (
            <Pill tone="live">LIVE · {game.status}</Pill>
          ) : game.state === 'post' ? (
            <Pill tone="final">{game.status}</Pill>
          ) : (
            <Pill tone="accent">
              {relativeDay(localDay(game, tz), todayKey(tz))} · {t.local}
            </Pill>
          )}
          <span className="truncate font-mono text-[10.5px] text-muted">
            {game.state === 'pre' ? [countdown(game.date), t.et].filter(Boolean).join(' · ') : game.note ?? game.venue}
          </span>
        </div>
        {(['away', 'home'] as const).map((ha) => (
          <ScoreRow
            key={ha}
            side={game[ha]}
            bright={lead === null || lead === ha}
            fav={ids.has(game[ha].team.id)}
            sub={[game[ha].record, ha].filter(Boolean).join(' · ')}
            right={game.state === 'pre' ? <FormChips results={detail.lastFive[ha]} label="Last five" /> : undefined}
          />
        ))}
        {game.venue && (
          <p className="text-[11px] text-muted">
            {game.venue}
            {game.city && `, ${game.city}`}
          </p>
        )}
      </section>

      {game.state !== 'pre' && detail.margin.length > 2 && (
        <section className="overflow-hidden rounded-[18px] border border-border bg-well">
          <div className="relative h-[280px]">
            <MarginHero detail={detail} run={run} height={280} />
          </div>
        </section>
      )}

      {game.state !== 'pre' && game.home.linescores.length > 0 && <Linescore game={game} />}

      {game.state === 'pre' && detail.predictor && (
        <section className="rounded-[18px] border border-border bg-surface p-4">
          <div className="flex justify-between text-[11px] text-muted">
            <span>Win probability</span>
            <span>ESPN matchup predictor</span>
          </div>
          <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            <span style={{ width: `${detail.predictor.away}%`, background: game.away.team.dot }} />
            <span className="flex-1" style={{ background: game.home.team.dot }} />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-xs">
            <span>
              {game.away.team.abbr} {detail.predictor.away}%
            </span>
            <span>
              {game.home.team.abbr} {detail.predictor.home}%
            </span>
          </div>
        </section>
      )}

      {game.state === 'pre' && (
        <section className="flex flex-col gap-2 rounded-[18px] border border-border bg-surface p-4 text-sm text-soft">
          {detail.seriesSummary && <p>Season series: {detail.seriesSummary}</p>}
          <RemindButton game={game} label />
        </section>
      )}

      {a && h && (
        <section className="flex flex-col gap-3 rounded-[18px] border border-border bg-surface p-4">
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <TeamBadge team={game.away.team} size={22} outlined={false} />
              {game.away.team.abbr}
            </span>
            <span>Team stats</span>
            <span className="flex items-center gap-1.5">
              {game.home.team.abbr}
              <TeamBadge team={game.home.team} size={22} outlined={false} />
            </span>
          </div>
          <StatBars
            leftColor={game.away.team.dot}
            rightColor={game.home.team.dot}
            rows={[
              { label: 'FG', left: a.fg, right: h.fg, lv: made(a.fg), rv: made(h.fg) },
              { label: 'FG%', left: a.fgPct, right: h.fgPct, lv: num(a.fgPct), rv: num(h.fgPct) },
              { label: '3PT', left: a.threes, right: h.threes, lv: made(a.threes), rv: made(h.threes) },
              { label: 'FT', left: a.ft, right: h.ft, lv: made(a.ft), rv: made(h.ft) },
              { label: 'REB', left: a.reb, right: h.reb, lv: num(a.reb), rv: num(h.reb) },
              { label: 'AST', left: a.ast, right: h.ast, lv: num(a.ast), rv: num(h.ast) },
              { label: 'STL', left: a.stl, right: h.stl, lv: num(a.stl), rv: num(h.stl) },
              { label: 'BLK', left: a.blk, right: h.blk, lv: num(a.blk), rv: num(h.blk) },
              { label: 'TOV', left: a.tov, right: h.tov, lv: num(a.tov), rv: num(h.tov) },
              { label: 'PAINT', left: a.paint, right: h.paint, lv: num(a.paint), rv: num(h.paint) },
            ].filter((r) => r.left || r.right)}
          />
          {(h.leadChanges || h.largestLead || a.largestLead) && (
            <p className="border-t border-border pt-2.5 text-xs text-muted">
              {h.leadChanges && `Lead changes ${h.leadChanges}`}
              {a.largestLead && ` · biggest lead ${game.away.team.abbr} +${a.largestLead}`}
              {h.largestLead && ` · ${game.home.team.abbr} +${h.largestLead}`}
            </p>
          )}
        </section>
      )}

      {(detail.leaders.away.length > 0 || detail.leaders.home.length > 0) && (
        <section className="grid grid-cols-2 gap-2">
          {(['away', 'home'] as const).map((ha) => (
            <Leaders key={ha} title={game[ha].team.name} color={game[ha].team.dot} leaders={detail.leaders[ha]} />
          ))}
        </section>
      )}

      {detail.recap && (
        <a
          href={detail.recap.url ?? '#'}
          target="_blank"
          rel="noreferrer"
          className="flex flex-col gap-1.5 rounded-[18px] border border-border bg-surface p-4"
        >
          <span className="font-mono text-[9px] tracking-[0.08em] text-muted">RECAP · ESPN</span>
          <span className="text-[17px] leading-[1.15] font-semibold">{detail.recap.headline}</span>
          {detail.recap.description && <span className="text-xs leading-[1.45] text-dim">{detail.recap.description}</span>}
          <span className="text-[13px] font-semibold text-accent">Read on ESPN →</span>
        </a>
      )}

      {game.state !== 'pre' && detail.recentPlays.length > 0 && (
        <section className="rounded-[18px] border border-border bg-surface p-4">
          <h2 className="mb-2 text-[15px] font-semibold">{game.state === 'in' ? 'Latest plays' : 'Final plays'}</h2>
          <ol className="flex flex-col">
            {detail.recentPlays.map((p, i) => (
              <li key={i} className="flex gap-2.5 border-t border-border py-2 first:border-t-0">
                <span className="w-14 flex-none font-mono text-[10.5px] text-muted">
                  {periodLabel(p.period)} {p.clock}
                </span>
                <span className={`min-w-0 flex-1 text-[12.5px] ${p.scoring ? 'text-text' : 'text-dim'}`}>{p.text}</span>
                <span className="flex-none font-mono text-[11px] text-muted">
                  {p.away}–{p.home}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <Link href="/calendar" className="pt-2 text-center text-xs font-semibold text-accent">
        Back to the calendar
      </Link>
    </main>
  )
}

function Leaders({ title, color, leaders }: { title: string; color: string; leaders: Leader[] }) {
  return (
    <div className="rounded-[18px] border border-border bg-surface p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
        <span className="size-2 rounded-full" style={{ background: color }} />
        {title}
      </div>
      <ul className="flex flex-col gap-1.5">
        {leaders.map((l) => (
          <li key={l.stat} className="flex items-baseline gap-1.5 text-xs">
            <span className="w-7 flex-none font-mono text-[9.5px] text-muted">{l.stat}</span>
            <span className="min-w-0 flex-1 truncate">{l.name}</span>
            <span className="font-mono font-semibold">{l.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
