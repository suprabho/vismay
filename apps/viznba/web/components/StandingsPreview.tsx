import Link from 'next/link'
import { CaretRight } from '@phosphor-icons/react/ssr'
import type { CupStandings, StandingRow, Standings } from '@/lib/espn'
import { confKey, confLabel, signed } from '@/lib/standings'
import { FavStar, TeamBadge } from './ui'

const MAX_ROWS = 5

function Card({ href, kicker, title, children }: { href: string; kicker: string; title: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block rounded-[18px] border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10.5px] font-bold tracking-[0.14em] text-accent">{kicker}</p>
          <h2 className="mt-1 truncate text-[17px] font-bold">{title}</h2>
        </div>
        <span className="flex flex-none items-center gap-0.5 text-xs font-semibold text-accent">
          Full table <CaretRight size={12} weight="bold" />
        </span>
      </div>
      {children}
    </Link>
  )
}

function Row({ pos, row, fav, cells }: { pos: number; row: StandingRow; fav: boolean; cells: string[] }) {
  return (
    <div className="col-span-full grid min-h-9 items-center gap-x-2 border-t border-border" style={{ gridTemplateColumns: 'subgrid' }}>
      <span className="text-muted">{pos}</span>
      <TeamBadge team={row.team} size={22} outlined={false} />
      <span className={`flex min-w-0 items-center gap-1.5 font-sans text-[13px] ${fav ? 'font-bold' : 'font-medium'}`}>
        <span className="truncate">{row.team.name}</span>
        {fav && <FavStar size={10} />}
      </span>
      {cells.map((c, i) => (
        <span key={i} className={`text-right ${i === 0 ? '' : 'text-muted'}`}>
          {c}
        </span>
      ))}
    </div>
  )
}

function Head({ cols }: { cols: string[] }) {
  return (
    <>
      <span className="col-span-3 pb-1.5 font-sans text-[10px] text-muted">Team</span>
      {cols.map((c) => (
        <span key={c} className="pb-1.5 text-right text-[10px] text-muted">
          {c}
        </span>
      ))}
    </>
  )
}

/**
 * Regular-season preview: the followed teams' rows in one conference (the top
 * five when none are followed there), linking to that conference's tab.
 */
export function StandingsPreview({ table, mine }: { table: Standings; mine: Set<string> }) {
  const conf = table.conferences.find((c) => c.rows.some((r) => mine.has(r.team.id))) ?? table.conferences.find((c) => confKey(c.name) === 'west') ?? table.conferences[0]
  if (!conf?.rows.length) return null
  const ranked = conf.rows.map((row, i) => ({ row, pos: row.seed || i + 1 }))
  const followedRows = ranked.filter((r) => mine.has(r.row.team.id))
  // Always show the leader for context, then the followed teams.
  const shown = followedRows.length
    ? [...new Set([ranked[0], ...followedRows])].slice(0, MAX_ROWS)
    : ranked.slice(0, MAX_ROWS)
  return (
    <Card href={`/for-you/standings?conf=${confKey(conf.name)}`} kicker={`NBA · ${table.season}`} title={conf.name}>
      <div className="mt-3 grid gap-x-2 font-mono text-[11.5px]" style={{ gridTemplateColumns: '18px 22px minmax(0,1fr) 44px 30px 34px' }}>
        <Head cols={['W–L', 'GB', 'L10']} />
        {shown.map(({ row, pos }) => (
          <Row key={row.team.id} pos={pos} row={row} fav={mine.has(row.team.id)} cells={[`${row.wins}–${row.losses}`, row.gb, row.lastTen]} />
        ))}
      </div>
    </Card>
  )
}

/** NBA Cup preview: the group of the first followed team (West Group A when none are followed). */
export function CupPreview({ table, mine }: { table: CupStandings; mine: Set<string> }) {
  const groups = table.conferences.flatMap((c) => c.groups.map((g) => ({ conf: c.name, ...g })))
  const group =
    groups.find((g) => g.rows.some((r) => mine.has(r.team.id))) ?? groups.find((g) => confKey(g.conf) === 'west') ?? groups[0]
  if (!group) return null
  const others = groups.filter((g) => g !== group && g.rows.some((r) => mine.has(r.team.id))).length
  return (
    <Card href="/for-you/cup" kicker={`NBA CUP · ${table.season}`} title={`${confLabel(group.conf).replace('ern', '')} ${group.name}`}>
      <div className="mt-3 grid gap-x-2 font-mono text-[11.5px]" style={{ gridTemplateColumns: '18px 22px minmax(0,1fr) 22px 34px 34px' }}>
        <Head cols={['GP', 'W–L', 'Diff']} />
        {group.rows.map((row, i) => (
          <Row
            key={row.team.id}
            pos={row.seed || i + 1}
            row={row}
            fav={mine.has(row.team.id)}
            cells={[String(row.wins + row.losses), `${row.wins}–${row.losses}`, signed(row.pointDiff)]}
          />
        ))}
      </div>
      {others > 0 && (
        <p className="mt-2.5 text-[11px] text-muted">
          Your teams are in {others} more {others === 1 ? 'group' : 'groups'}.
        </p>
      )}
    </Card>
  )
}
