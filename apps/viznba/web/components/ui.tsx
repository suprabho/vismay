import type { ReactNode } from 'react'
import { Star } from '@phosphor-icons/react/ssr'
import { teamLogo, type Team } from '@/lib/teams'
import type { Game, Side } from '@/lib/espn'

const BADGE: Record<number, string> = {
  22: 'size-[22px] text-[8px]',
  26: 'size-[26px] text-[8.5px]',
  32: 'size-8 text-[10px]',
  48: 'size-12 text-[13px]',
}

export function TeamBadge({
  team,
  size = 32,
  outlined = true,
}: {
  team: Team
  size?: 22 | 26 | 32 | 48
  outlined?: boolean
}) {
  const logo = teamLogo(team, size)
  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="flex-none object-contain"
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    )
  }
  return (
    <span
      className={`flex flex-none items-center justify-center rounded-full font-extrabold wdth-80 ${BADGE[size]} ${
        outlined ? 'border border-white/15' : ''
      }`}
      style={{ background: team.bg, color: team.fg }}
      aria-hidden="true"
    >
      {team.abbr}
    </span>
  )
}

export function TeamChip({ team }: { team: Team }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-border bg-bg py-1 pr-2.5 pl-1 text-xs font-medium">
      <TeamBadge team={team} size={22} outlined={false} />
      {team.name}
    </span>
  )
}

export function LiveDot() {
  return <span className="vn-pulse size-1.5 flex-none rounded-full bg-live" aria-hidden="true" />
}

export function FavStar({ size = 12 }: { size?: number }) {
  return <Star size={size} weight="fill" className="flex-none text-accent" aria-label="Your team" />
}

/** Rounded status pill used at the top of game cards. */
export function Pill({ tone, children }: { tone: 'live' | 'accent' | 'final'; children: ReactNode }) {
  const cls =
    tone === 'live'
      ? 'bg-live/15 text-live-text'
      : tone === 'accent'
        ? 'bg-accent/18 text-accent'
        : 'bg-text/8 text-[#d4d4da]'
  return (
    <span className={`inline-flex flex-none items-center gap-1.5 rounded-full px-[9px] py-1 text-[11px] font-bold tracking-[0.06em] whitespace-nowrap ${cls}`}>
      {tone === 'live' && <LiveDot />}
      {children}
    </span>
  )
}

export function FormChips({ results, label }: { results: Array<'W' | 'L'>; label: string }) {
  if (!results.length) return null
  return (
    <div className="flex gap-[3px]" aria-label={`${label}: ${results.join(' ')}`}>
      {results.map((r, i) =>
        r === 'W' ? (
          <span key={i} className="flex size-[15px] items-center justify-center rounded bg-[#e8e8ec] font-mono text-[8.5px] font-bold text-bg">
            W
          </span>
        ) : (
          <span key={i} className="flex size-[15px] items-center justify-center rounded border border-[#4a5060] font-mono text-[8.5px] font-bold text-muted">
            L
          </span>
        ),
      )}
    </div>
  )
}

/** The side that's ahead (or won); null before tip-off or when level. */
export function leader(g: Game): 'home' | 'away' | null {
  if (g.state === 'pre' || g.home.score == null || g.away.score == null) return null
  if (g.home.score === g.away.score) return null
  return g.home.score > g.away.score ? 'home' : 'away'
}

/**
 * One team row on a scoreboard card: badge, name (+ star if followed),
 * a sub-line, and the score (dimmed for the trailing side).
 */
export function ScoreRow({
  side,
  bright,
  fav,
  sub,
  right,
  size = 'lg',
}: {
  side: Side
  bright: boolean
  fav: boolean
  sub?: string | null
  right?: ReactNode
  size?: 'lg' | 'md'
}) {
  return (
    <div className="flex items-center gap-2.5">
      <TeamBadge team={side.team} size={size === 'lg' ? 32 : 26} />
      <div className="min-w-0 flex-1">
        <div
          className={`flex items-center gap-1.5 font-bold ${size === 'lg' ? 'text-[17px]' : 'text-[14.5px] font-semibold'} ${
            bright ? 'text-text' : 'text-[#b9b9c2]'
          }`}
        >
          <span className="truncate">{side.team.name}</span>
          {fav && <FavStar />}
        </div>
        {sub && <div className="font-mono text-[11px] text-muted">{sub}</div>}
      </div>
      {right ??
        (side.score != null && (
          <div
            className={`font-mono ${size === 'lg' ? 'text-[28px]' : 'text-[17px]'} ${
              bright ? 'font-bold text-text' : 'font-medium text-muted'
            }`}
          >
            {side.score}
          </div>
        ))}
    </div>
  )
}

/** Quarter-by-quarter grid with the decisive quarter highlighted. */
export function Linescore({ game }: { game: Game }) {
  const periods = Math.max(4, game.home.linescores.length, game.away.linescores.length)
  const labels = Array.from({ length: periods }, (_, i) => (i < 4 ? `Q${i + 1}` : i === 4 ? 'OT' : `${i - 3}OT`))
  const win = leader(game)
  // The quarter the winner won by the most.
  let hot = -1
  if (win) {
    const lose = win === 'home' ? 'away' : 'home'
    let best = 0
    for (let i = 0; i < periods; i++) {
      const d = (game[win].linescores[i] ?? 0) - (game[lose].linescores[i] ?? 0)
      if (d > best) {
        best = d
        hot = i
      }
    }
  }
  const cols = { gridTemplateColumns: `48px repeat(${periods}, minmax(0, 1fr)) 44px` }
  const row = (s: Side, isWin: boolean) => (
    <div className={`mt-1 grid gap-1 text-center ${isWin ? '' : 'text-muted'}`} style={cols}>
      <span className={`text-left ${isWin ? 'font-bold' : ''}`}>{s.team.abbr}</span>
      {labels.map((_, i) => (
        <span
          key={i}
          className={isWin && i === hot ? 'rounded bg-accent/22 font-bold text-accent' : ''}
        >
          {s.linescores[i] ?? '–'}
        </span>
      ))}
      <span className={`text-right ${isWin ? 'font-bold' : ''}`}>{s.score ?? ''}</span>
    </div>
  )
  return (
    <div className="rounded-xl bg-bg/60 px-3 py-2.5 font-mono text-xs">
      <div className="grid gap-1 text-center text-[10px] text-muted" style={cols}>
        <span />
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
        <span className="text-right">T</span>
      </div>
      {row(game.away, win === 'away')}
      {row(game.home, win === 'home')}
    </div>
  )
}

/** Mirrored comparison bars: left team grows right-to-left, right team left-to-right. */
export function StatBars({
  rows,
  leftColor,
  rightColor,
}: {
  rows: Array<{ label: string; left: string; right: string; lv: number; rv: number; lowerIsBetter?: boolean }>
  leftColor: string
  rightColor: string
}) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => {
        const max = Math.max(r.lv, r.rv) || 1
        return (
          <div
            key={r.label}
            className="grid items-center gap-1.5 font-mono text-[11px]"
            style={{ gridTemplateColumns: '44px minmax(0,1fr) 36px minmax(0,1fr) 44px' }}
          >
            <span>{r.left}</span>
            <span className="flex h-1.5 justify-end rounded-full bg-border">
              <span className="rounded-full" style={{ width: `${(r.lv / max) * 100}%`, background: leftColor }} />
            </span>
            <span className="text-center text-[9.5px] text-muted">{r.label}</span>
            <span className="flex h-1.5 rounded-full bg-border">
              <span className="rounded-full" style={{ width: `${(r.rv / max) * 100}%`, background: rightColor }} />
            </span>
            <span className="text-right text-muted">{r.right}</span>
          </div>
        )
      })}
    </div>
  )
}

/** "16-39" → 16 */
export function made(s: string | undefined): number {
  return Number((s ?? '').split('-')[0]) || 0
}

export function num(s: string | undefined): number {
  return Number(s) || 0
}

/** Glow + border tint for a card themed on one or two teams. */
export function cardTheme(teams: Team[], strength = 1) {
  const [a, b] = teams
  return {
    border: `color-mix(in srgb, ${a.dot} ${Math.round(45 * strength)}%, transparent)`,
    glows: b
      ? [
          { color: a.bg, side: 'left' as const, opacity: 0.35 * strength },
          { color: b.bg, side: 'right' as const, opacity: 0.45 * strength },
        ]
      : [{ color: a.bg, side: 'center' as const, opacity: 0.3 * strength }],
  }
}

export function Glow({ color, side, opacity }: { color: string; side: 'left' | 'right' | 'center'; opacity: number }) {
  const pos =
    side === 'left' ? 'left-[-40%] w-[110%]' : side === 'right' ? 'right-[-40%] w-[110%]' : 'left-[-20%] w-[140%]'
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute top-[-120px] h-[210px] rounded-full ${pos}`}
      style={{ background: `radial-gradient(closest-side, ${color}, transparent)`, opacity }}
    />
  )
}
