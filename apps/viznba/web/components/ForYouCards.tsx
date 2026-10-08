import Link from 'next/link'
import { Bell, CaretRight, Clock, TrendUp } from '@phosphor-icons/react/ssr'
import type { Game, GameDetail, Side } from '@/lib/espn'
import { maxLeads } from '@/lib/margin'
import { localDay, relativeDay, shortDate, tipoff } from '@/lib/labels'
import { countdown, dayMonth, dayKey } from '@/lib/time'
import type { Team } from '@/lib/teams'
import { MarginSpark, marginText } from './MarginChart'
import { FavStar, FormChips, Glow, leader, Linescore, made, num, Pill, ScoreRow, StatBars, TeamBadge } from './ui'

type Ctx = { tz: string; today: string; followed: Set<string> }

function themeTeams(g: Game, ctx: Ctx): Team[] {
  const mine = [g.away.team, g.home.team].filter((t) => ctx.followed.has(t.id))
  return mine.length ? mine : [g.home.team]
}

function Shell({
  game,
  ctx,
  rich = true,
  children,
}: {
  game: Game
  ctx: Ctx
  rich?: boolean
  children: React.ReactNode
}) {
  const teams = themeTeams(game, ctx)
  const primary = teams[0]
  const glows =
    teams.length > 1
      ? [
          <Glow key="a" color={teams[0].bg} side="left" opacity={0.35} />,
          <Glow key="b" color={teams[1].bg} side="right" opacity={0.45} />,
        ]
      : [<Glow key="a" color={primary.bg} side="center" opacity={rich ? 0.3 : 0.2} />]
  return (
    <article
      className="relative overflow-hidden rounded-[18px] border bg-surface"
      style={{
        borderColor: `color-mix(in srgb, ${primary.dot} 45%, transparent)`,
        boxShadow: rich ? `0 10px 30px -14px color-mix(in srgb, ${primary.bg} 70%, transparent)` : undefined,
      }}
    >
      {glows}
      <div className={`relative flex flex-col p-4 ${rich ? 'gap-3.5' : 'gap-3'}`}>{children}</div>
    </article>
  )
}

function homeAwayTag(s: Side): string {
  return s.homeAway === 'home' ? 'home' : 'away'
}

function sub(s: Side, withVenue = false): string | null {
  const parts = [s.record, withVenue ? homeAwayTag(s) : null].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/* ------------------------------------------------------------------ live */

export function LiveCard({ game, detail, ctx }: { game: Game; detail: GameDetail | null; ctx: Ctx }) {
  const lead = leader(game)
  const persp = themeTeams(game, ctx)[0]
  const perspSide = game.home.team.id === persp.id ? 'home' : 'away'
  const leads = detail ? maxLeads(detail.margin) : null
  const maxMine = leads ? leads[perspSide] : 0
  return (
    <Shell game={game} ctx={ctx}>
      <div className="flex items-center justify-between">
        <Pill tone="live">LIVE · {game.status}</Pill>
        <span className="text-[11px] text-muted">Started {tipoff(game, ctx.tz).local}</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {(['away', 'home'] as const).map((ha) => (
          <ScoreRow
            key={ha}
            side={game[ha]}
            bright={lead === null || lead === ha}
            fav={ctx.followed.has(game[ha].team.id)}
            sub={sub(game[ha], ha === 'home')}
          />
        ))}
      </div>
      {detail && detail.margin.length > 1 && (
        <div>
          <div className="flex justify-between text-[11px] text-muted">
            <span>Score margin</span>
            <span className="font-mono">
              {marginText(detail, persp)}
              {maxMine > 0 && ` · max ${persp.abbr} +${maxMine}`}
            </span>
          </div>
          <div className="mt-1.5">
            <MarginSpark detail={detail} perspective={perspSide} color={persp.dot} />
          </div>
          <div className="grid grid-cols-4 text-center font-mono text-[9.5px] text-muted">
            <span>Q1</span>
            <span>Q2</span>
            <span>Q3</span>
            <span>Q4</span>
          </div>
        </div>
      )}
      <Link
        href={`/game/${game.id}`}
        className="flex min-h-11 items-center justify-center rounded-xl border border-border bg-bg text-[13px] font-semibold"
      >
        Live stats &amp; play-by-play →
      </Link>
    </Shell>
  )
}

/* --------------------------------------------------------------- preview */

export function RemindButton({ game, label = false }: { game: Game; label?: boolean }) {
  const cls = label
    ? 'flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border-strong bg-bg text-[13px] font-semibold'
    : 'flex size-11 flex-none items-center justify-center rounded-full border border-border-strong bg-bg'
  return (
    <a href={`/api/remind/${game.id}`} download className={cls} aria-label={label ? undefined : 'Remind me (add to calendar)'}>
      <Bell size={label ? 16 : 18} />
      {label && 'Remind me'}
    </a>
  )
}

export function PreviewCard({
  game,
  detail,
  ctx,
  notes,
}: {
  game: Game
  detail: GameDetail | null
  ctx: Ctx
  notes: string[]
}) {
  const t = tipoff(game, ctx.tz)
  const cd = countdown(game.date)
  const p = detail?.predictor
  const lm = detail?.lastMeeting
  const allNotes = [...notes]
  if (lm) {
    const homeWon = lm.homeScore > lm.awayScore
    const [wAbbr, wPts, lAbbr, lPts] = homeWon
      ? [lm.homeAbbr, lm.homeScore, lm.awayAbbr, lm.awayScore]
      : [lm.awayAbbr, lm.awayScore, lm.homeAbbr, lm.homeScore]
    allNotes.push(`Last meeting: ${wAbbr} ${wPts}–${lPts} ${lAbbr} · ${dayMonth(dayKey(lm.date, ctx.tz))}`)
  } else if (detail?.seriesSummary) {
    allNotes.push(detail.seriesSummary)
  }
  return (
    <Shell game={game} ctx={ctx}>
      <div className="flex items-center justify-between gap-2">
        <Pill tone="accent">
          {relativeDay(localDay(game, ctx.tz), ctx.today)} · {t.local}
        </Pill>
        <span className="min-w-0 truncate text-right font-mono text-[10.5px] text-muted">{[cd, t.et].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {(['away', 'home'] as const).map((ha) => (
          <ScoreRow
            key={ha}
            side={game[ha]}
            bright
            fav={ctx.followed.has(game[ha].team.id)}
            sub={sub(game[ha], true)}
            right={<FormChips results={detail?.lastFive[ha] ?? []} label="Last five" />}
          />
        ))}
      </div>
      {p && (
        <div>
          <div className="flex justify-between text-[11px] text-muted">
            <span>Win probability</span>
            <span>ESPN matchup predictor</span>
          </div>
          <div className="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded-full">
            <span style={{ width: `${p.away}%`, background: game.away.team.dot }} />
            <span className="flex-1" style={{ background: game.home.team.dot }} />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[11px]">
            <span>
              {game.away.team.abbr} {p.away}%
            </span>
            <span>
              {game.home.team.abbr} {p.home}%
            </span>
          </div>
        </div>
      )}
      {allNotes.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl bg-bg/60 px-3 py-2.5 text-xs text-soft">
          {allNotes.map((n, i) => (
            <div key={n} className="flex items-center gap-2">
              {i === allNotes.length - 1 && lm ? (
                <TrendUp size={14} className="flex-none text-muted" />
              ) : (
                <Clock size={14} className="flex-none text-muted" />
              )}
              {n}
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <RemindButton game={game} label />
        <Link
          href={`/game/${game.id}`}
          className="flex min-h-11 items-center justify-center rounded-xl bg-accent text-[13px] font-bold text-accent-ink"
        >
          Match preview →
        </Link>
      </div>
    </Shell>
  )
}

/* ----------------------------------------------------------------- final */

export function FinalCard({ game, detail, ctx }: { game: Game; detail: GameDetail | null; ctx: Ctx }) {
  const lead = leader(game)
  const day = localDay(game, ctx.tz)
  const followedSide = ctx.followed.has(game.away.team.id) ? game.away : game.home
  const where = followedSide.homeAway === 'away' && game.city ? `@ ${game.city}` : game.city ? `in ${game.city}` : ''
  const box = detail?.box
  const a = game.away
  const h = game.home
  const rows = box?.away && box.home
    ? [
        { label: 'FG%', left: box.away.fgPct, right: box.home.fgPct, lv: num(box.away.fgPct), rv: num(box.home.fgPct) },
        { label: '3PT', left: box.away.threes.replace('-', '/'), right: box.home.threes.replace('-', '/'), lv: made(box.away.threes), rv: made(box.home.threes) },
        { label: 'REB', left: box.away.reb, right: box.home.reb, lv: num(box.away.reb), rv: num(box.home.reb) },
        { label: 'TOV', left: box.away.tov, right: box.home.tov, lv: num(box.away.tov), rv: num(box.home.tov) },
      ]
    : a.stats.fieldGoalPct
      ? [
          { label: 'FG%', left: a.stats.fieldGoalPct, right: h.stats.fieldGoalPct, lv: num(a.stats.fieldGoalPct), rv: num(h.stats.fieldGoalPct) },
          { label: '3PT', left: `${a.stats.threePointFieldGoalsMade}/${a.stats.threePointFieldGoalsAttempted}`, right: `${h.stats.threePointFieldGoalsMade}/${h.stats.threePointFieldGoalsAttempted}`, lv: num(a.stats.threePointFieldGoalsMade), rv: num(h.stats.threePointFieldGoalsMade) },
          { label: 'REB', left: a.stats.rebounds, right: h.stats.rebounds, lv: num(a.stats.rebounds), rv: num(h.stats.rebounds) },
          { label: 'AST', left: a.stats.assists, right: h.stats.assists, lv: num(a.stats.assists), rv: num(h.stats.assists) },
        ]
      : []
  return (
    <Shell game={game} ctx={ctx}>
      <div className="flex items-center justify-between">
        <Pill tone="final">
          {game.status} · {relativeDay(day, ctx.today)}
        </Pill>
        <span className="text-[11px] text-muted">
          {shortDate(day)}
          {where && ` · ${where}`}
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {(['away', 'home'] as const).map((ha) => (
          <ScoreRow key={ha} side={game[ha]} bright={lead === ha} fav={ctx.followed.has(game[ha].team.id)} />
        ))}
      </div>
      <Linescore game={game} />
      {rows.length > 0 && <StatBars rows={rows} leftColor={a.team.dot} rightColor={h.team.dot} />}
      <Link
        href={`/game/${game.id}`}
        className="flex min-h-11 items-center justify-between gap-2.5 rounded-xl border border-border bg-bg px-3 py-2"
      >
        <span className="min-w-0 text-[13px] leading-[1.3] font-medium">
          {detail?.recap?.headline ?? 'Box score, margin chart and leaders'}
        </span>
        <span className="flex-none text-xs font-semibold text-accent">{detail?.recap ? 'Read' : 'Open'}</span>
      </Link>
    </Shell>
  )
}

/* --------------------------------------------------------------- medium */

export function UpcomingMedium({ game, ctx }: { game: Game; ctx: Ctx }) {
  const t = tipoff(game, ctx.tz)
  return (
    <Shell game={game} ctx={ctx} rich={false}>
      <div className="flex items-center justify-between gap-2">
        <Pill tone="accent">
          {relativeDay(localDay(game, ctx.tz), ctx.today)} · {t.local}
        </Pill>
        {t.et && <span className="min-w-0 truncate text-right font-mono text-[10.5px] text-muted">{t.et}</span>}
      </div>
      {(['away', 'home'] as const).map((ha) => (
        <div key={ha} className="flex items-center gap-2.5">
          <TeamBadge team={game[ha].team} />
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-base font-bold">
            {game[ha].team.name}
            {ctx.followed.has(game[ha].team.id) && <FavStar />}
            {game[ha].record && <span className="font-mono text-[11px] font-normal text-muted">{game[ha].record}</span>}
          </div>
          {ha === 'home' && <RemindButton game={game} />}
        </div>
      ))}
    </Shell>
  )
}

export function FinalMedium({ game, detail, ctx }: { game: Game; detail: GameDetail | null; ctx: Ctx }) {
  const lead = leader(game)
  const day = localDay(game, ctx.tz)
  const periods = Math.max(4, game.home.linescores.length)
  const leads = detail ? maxLeads(detail.margin) : null
  const big = leads ? (leads.home >= leads.away ? { t: game.home.team, n: leads.home } : { t: game.away.team, n: leads.away }) : null
  return (
    <Shell game={game} ctx={ctx} rich={false}>
      <div className="flex items-center justify-between">
        <Pill tone="final">
          {game.status} · {relativeDay(day, ctx.today)}
        </Pill>
        {game.city && <span className="text-[11px] text-muted">{game.city}</span>}
      </div>
      <div
        className="grid items-center gap-x-2 gap-y-2 text-center font-mono text-[11px]"
        style={{ gridTemplateColumns: `32px minmax(0,1fr) repeat(${periods}, 22px) 40px` }}
      >
        {(['away', 'home'] as const).map((ha) => {
          const s = game[ha]
          const bright = lead === ha
          return [
            <TeamBadge key={`${ha}b`} team={s.team} />,
            <span key={`${ha}n`} className={`flex items-center gap-1.5 text-left font-sans text-base font-bold ${bright ? '' : 'text-[#b9b9c2]'}`}>
              <span className="truncate">{s.team.name}</span>
              {ctx.followed.has(s.team.id) && <FavStar />}
            </span>,
            ...Array.from({ length: periods }, (_, i) => (
              <span key={`${ha}${i}`} className={bright ? '' : 'text-muted'}>
                {s.linescores[i] ?? '–'}
              </span>
            )),
            <span key={`${ha}t`} className={`text-right text-lg ${bright ? 'font-bold' : 'font-medium text-muted'}`}>
              {s.score}
            </span>,
          ]
        })}
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted">
          {detail?.box.home?.leadChanges ? `Lead changes ${detail.box.home.leadChanges}` : shortDate(day)}
          {big && big.n > 0 && ` · biggest lead ${big.t.abbr} +${big.n}`}
        </span>
        <Link href={`/game/${game.id}`} className="font-semibold text-accent">
          {detail?.recap ? 'Recap' : 'Box score'}
        </Link>
      </div>
    </Shell>
  )
}

/* -------------------------------------------------------------- compact */

export function CompactRow({ game, ctx }: { game: Game; ctx: Ctx }) {
  const mineSide = ctx.followed.has(game.away.team.id) ? 'away' : 'home'
  const me = game[mineSide]
  const them = game[mineSide === 'away' ? 'home' : 'away']
  const day = localDay(game, ctx.tz)
  const border = `color-mix(in srgb, ${me.team.dot} 40%, transparent)`
  if (game.state === 'post') {
    const diff = (me.score ?? 0) - (them.score ?? 0)
    return (
      <article className="flex items-center gap-2.5 rounded-[18px] border bg-surface px-4 py-3.5" style={{ borderColor: border }}>
        <TeamBadge team={me.team} />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[15px] font-bold">
            {me.team.abbr} {me.score} <span className="font-medium text-muted">– {them.score} {them.team.abbr}</span>
          </div>
          <div className="text-[11px] text-muted">
            {game.status} · {shortDate(day)} · {me.homeAway} · {diff > 0 ? `W by ${diff}` : `L by ${-diff}`}
          </div>
        </div>
        <Link href={`/game/${game.id}`} aria-label="Open game" className="flex size-11 items-center justify-center text-muted">
          <CaretRight size={14} weight="bold" />
        </Link>
      </article>
    )
  }
  const t = tipoff(game, ctx.tz)
  return (
    <article className="flex items-center gap-2.5 rounded-[18px] border bg-surface px-4 py-3.5" style={{ borderColor: border }}>
      <TeamBadge team={me.team} />
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[15px] font-bold">
          {me.team.abbr}{' '}
          <span className="font-medium text-muted">
            {me.homeAway === 'away' ? '@' : 'vs'} {them.team.abbr}
          </span>
        </div>
        <div className="text-[11px] text-muted">
          {relativeDay(day, ctx.today)} · {t.local}
          {t.et && ` · ${t.et}`}
        </div>
      </div>
      <RemindButton game={game} />
    </article>
  )
}
