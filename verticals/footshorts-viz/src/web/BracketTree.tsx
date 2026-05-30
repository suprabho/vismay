'use client'

import type { Bracket as BracketModel, BracketRound, BracketTie, FixtureTeamRef } from '../types'
import { stageLabel } from '../stageLabel'
import { Crest } from '../data/Crest'
import { findTeam } from '../data/teams'
import { getCompetitionDisplayName, getCompetitionPalette } from '../competitionMeta'

/**
 * Full mirrored tournament bracket (web only — see modules/bracket/Component.tsx).
 *
 * Renders a classic broadcast-style draw: outer rounds flow inward on the left
 * (R16 → QF → SF), a centre final + competition emblem, and the right half
 * mirrored. One team's run can be highlighted via `highlightTeamId`.
 *
 * Implementation: absolutely-positioned HTML cells over a single SVG connector
 * layer. Deliberately NOT <foreignObject> — that mis-renders in the
 * Playwright/Chromium slides/report/video capture pipeline this story targets.
 */

type Props = {
  bracket: BracketModel
  highlightTeamId?: string
  title?: string
  competitionSlug?: string
}

const CELL_W = 184
const CELL_H = 52
const COL_GAP = 44
const ROW_GAP = 20
const PAD = 20
const HEADER_H = 30
const COL_W = CELL_W + COL_GAP
const SLOT = CELL_H + ROW_GAP
const TOP = PAD + HEADER_H

type Side = 'left' | 'right'

function tieInvolves(tie: BracketTie, teamId: string | undefined): boolean {
  if (!teamId) return false
  return tie.teamA?.id === teamId || tie.teamB?.id === teamId
}

function teamShort(ref: FixtureTeamRef, fallback: string): string {
  const key = ref?.slug ?? ref?.name ?? fallback
  const t = findTeam(key)
  return t?.shortName ?? t?.name ?? ref?.name ?? fallback
}

function TeamLine({
  teamRef,
  name,
  score,
  winner,
}: {
  teamRef: FixtureTeamRef
  name: string
  score: number | null
  winner: boolean
}) {
  const slug = teamRef?.slug ?? name
  const tone = winner ? 'font-semibold text-text' : 'text-text/55'
  return (
    <div className="flex items-center gap-1.5 px-2" style={{ height: CELL_H / 2 }}>
      <Crest team={slug} crestUrl={teamRef?.crest_url ?? undefined} size={18} className="shrink-0 object-contain" />
      <span className={`min-w-0 flex-1 truncate text-[12px] ${tone}`}>{teamShort(teamRef, name)}</span>
      <span className={`tabular-nums text-[12px] ${tone}`}>{score ?? '–'}</span>
    </div>
  )
}

function TieCell({
  tie,
  x,
  yCenter,
  highlight,
}: {
  tie: BracketTie
  x: number
  yCenter: number
  highlight: boolean
}) {
  const aggA = tie.aggregate?.a ?? null
  const aggB = tie.aggregate?.b ?? null
  const winA = !!tie.winnerTeamId && tie.winnerTeamId === tie.teamA?.id
  const winB = !!tie.winnerTeamId && tie.winnerTeamId === tie.teamB?.id
  return (
    <div
      className="absolute flex flex-col justify-center overflow-hidden rounded-md bg-white/5"
      style={{
        left: x,
        top: yCenter - CELL_H / 2,
        width: CELL_W,
        height: CELL_H,
        border: highlight ? '1px solid var(--color-accent, #e2117a)' : '1px solid rgba(255,255,255,0.15)',
        boxShadow: highlight ? '0 0 14px -2px var(--color-accent, #e2117a)' : undefined,
        zIndex: 10,
      }}
    >
      <TeamLine teamRef={tie.teamA} name={tie.teamAName} score={aggA} winner={winA} />
      <div className="border-t border-white/10" />
      <TeamLine teamRef={tie.teamB} name={tie.teamBName} score={aggB} winner={winB} />
    </div>
  )
}

export function BracketTree({ bracket, highlightTeamId, title, competitionSlug }: Props) {
  if (bracket.rounds.length === 0) return null

  const slug = competitionSlug ?? bracket.competition_slug
  const emblemColor = getCompetitionPalette(slug) ?? '#0E1E5B'
  const compName = getCompetitionDisplayName(slug)

  // Identify the final (explicit FINAL stage, else a trailing single-tie round).
  const lastRound = bracket.rounds[bracket.rounds.length - 1]
  const finalRound: BracketRound | undefined =
    bracket.rounds.find((r) => r.stage === 'FINAL') ??
    (lastRound && lastRound.ties.length === 1 ? lastRound : undefined)
  const outerRounds = bracket.rounds.filter((r) => r !== finalRound)
  const nDepth = outerRounds.length

  // Split each outer round into left (first half) / right (second half).
  const sideCols = (side: Side): BracketTie[][] =>
    outerRounds.map((round) => {
      const half = Math.ceil(round.ties.length / 2)
      return side === 'left' ? round.ties.slice(0, half) : round.ties.slice(half)
    })

  // Vertical centres: R16 evenly spaced; each later cell on the midpoint of its
  // two feeder cells (standard bracket recursion).
  const yCentersForSide = (cols: BracketTie[][]): number[][] => {
    const ys: number[][] = []
    cols.forEach((col, d) => {
      if (d === 0) {
        ys.push(col.map((_, i) => TOP + i * SLOT + CELL_H / 2))
      } else {
        const prev = ys[d - 1]!
        ys.push(
          col.map((_, j) => {
            const a = prev[2 * j]
            const b = prev[2 * j + 1]
            if (a != null && b != null) return (a + b) / 2
            if (a != null) return a
            return TOP + j * SLOT * Math.pow(2, d) + CELL_H / 2
          }),
        )
      }
    })
    return ys
  }

  const leftCols = sideCols('left')
  const rightCols = sideCols('right')
  const leftYs = yCentersForSide(leftCols)
  const rightYs = yCentersForSide(rightCols)

  const leftX = (d: number) => PAD + d * COL_W
  const finalX = PAD + nDepth * COL_W
  const rightX = (d: number) => finalX + COL_W + (nDepth - 1 - d) * COL_W

  // Final cell centre = midpoint of the two semifinal cells.
  const sfLeftY = leftYs[nDepth - 1]?.[0]
  const sfRightY = rightYs[nDepth - 1]?.[0]
  const finalY = sfLeftY != null && sfRightY != null ? (sfLeftY + sfRightY) / 2 : TOP + 2 * SLOT

  // Canvas size.
  let maxBottom = finalY + CELL_H / 2
  const allYs = [...leftYs.flat(), ...rightYs.flat()]
  for (const y of allYs) maxBottom = Math.max(maxBottom, y + CELL_H / 2)
  const totalW = rightX(0) + CELL_W + PAD
  const totalH = maxBottom + PAD

  // Connector paths.
  type Conn = { key: string; d: string; on: boolean }
  const conns: Conn[] = []
  const elbow = (fx: number, fy: number, px: number, py: number) => {
    const mx = (fx + px) / 2
    return `M ${fx},${fy} H ${mx} V ${py} H ${px}`
  }
  // Left side: feeders to the left of the parent.
  for (let d = 1; d < nDepth; d++) {
    leftCols[d]!.forEach((parent, j) => {
      const px = leftX(d)
      const py = leftYs[d]![j]!
      for (const f of [2 * j, 2 * j + 1]) {
        const feeder = leftCols[d - 1]?.[f]
        const fy = leftYs[d - 1]?.[f]
        if (!feeder || fy == null) continue
        conns.push({
          key: `lc-${d}-${j}-${f}`,
          d: elbow(leftX(d - 1) + CELL_W, fy, px, py),
          on: tieInvolves(parent, highlightTeamId) && tieInvolves(feeder, highlightTeamId),
        })
      }
    })
  }
  // Right side: feeders to the right of the parent (mirrored).
  for (let d = 1; d < nDepth; d++) {
    rightCols[d]!.forEach((parent, j) => {
      const px = rightX(d) + CELL_W
      const py = rightYs[d]![j]!
      for (const f of [2 * j, 2 * j + 1]) {
        const feeder = rightCols[d - 1]?.[f]
        const fy = rightYs[d - 1]?.[f]
        if (!feeder || fy == null) continue
        conns.push({
          key: `rc-${d}-${j}-${f}`,
          d: elbow(rightX(d - 1), fy, px, py),
          on: tieInvolves(parent, highlightTeamId) && tieInvolves(feeder, highlightTeamId),
        })
      }
    })
  }
  // Semifinal → final.
  const finalTie = finalRound?.ties[0]
  if (nDepth >= 1 && finalTie) {
    const sfL = leftCols[nDepth - 1]?.[0]
    const sfR = rightCols[nDepth - 1]?.[0]
    if (sfL && sfLeftY != null) {
      conns.push({
        key: 'fin-l',
        d: elbow(leftX(nDepth - 1) + CELL_W, sfLeftY, finalX, finalY),
        on: tieInvolves(sfL, highlightTeamId) && tieInvolves(finalTie, highlightTeamId),
      })
    }
    if (sfR && sfRightY != null) {
      conns.push({
        key: 'fin-r',
        d: elbow(rightX(nDepth - 1), sfRightY, finalX + CELL_W, finalY),
        on: tieInvolves(sfR, highlightTeamId) && tieInvolves(finalTie, highlightTeamId),
      })
    }
  }

  // Column headers (left, centre, right).
  const headers: { key: string; x: number; label: string }[] = []
  outerRounds.forEach((round, d) => {
    headers.push({ key: `hl-${d}`, x: leftX(d) + CELL_W / 2, label: stageLabel(round.stage) })
    headers.push({ key: `hr-${d}`, x: rightX(d) + CELL_W / 2, label: stageLabel(round.stage) })
  })
  headers.push({ key: 'hf', x: finalX + CELL_W / 2, label: 'Final' })

  return (
    <div className="w-full overflow-x-auto">
      <div className="relative mx-auto" style={{ width: totalW, height: totalH }}>
        {/* connector layer */}
        <svg
          width={totalW}
          height={totalH}
          className="absolute inset-0"
          style={{ pointerEvents: 'none', zIndex: 0, overflow: 'visible' }}
        >
          {conns.map((c) => (
            <path
              key={c.key}
              d={c.d}
              fill="none"
              stroke={c.on ? 'var(--color-accent, #e2117a)' : 'rgba(255,255,255,0.22)'}
              strokeWidth={c.on ? 2 : 1}
            />
          ))}
        </svg>

        {/* column headers */}
        {headers.map((h) => (
          <div
            key={h.key}
            className="absolute -translate-x-1/2 text-center text-[10px] font-bold uppercase tracking-[1.6px] text-text/70"
            style={{ left: h.x, top: PAD, width: CELL_W, zIndex: 5 }}
          >
            {h.label}
          </div>
        ))}

        {/* centre emblem */}
        <div
          className="absolute flex -translate-x-1/2 flex-col items-center"
          style={{ left: finalX + CELL_W / 2, top: Math.max(PAD + HEADER_H, finalY - CELL_H / 2 - 78), zIndex: 6 }}
        >
          <div
            className="flex items-center justify-center rounded-full text-[15px] font-bold text-white"
            style={{
              width: 52,
              height: 52,
              background: emblemColor,
              boxShadow: '0 6px 18px -6px rgba(0,0,0,0.6)',
              border: '2px solid rgba(255,255,255,0.25)',
            }}
            aria-label={compName}
          >
            ★
          </div>
          {title ? (
            <div className="mt-1.5 whitespace-nowrap text-[11px] font-semibold text-text/80">{title}</div>
          ) : null}
        </div>

        {/* tie cells */}
        {(['left', 'right'] as Side[]).map((side) => {
          const cols = side === 'left' ? leftCols : rightCols
          const ys = side === 'left' ? leftYs : rightYs
          return cols.flatMap((col, d) =>
            col.map((tie, i) => (
              <TieCell
                key={`${side}-${d}-${i}-${tie.legs.map((l) => l.id).join('|')}`}
                tie={tie}
                x={side === 'left' ? leftX(d) : rightX(d)}
                yCenter={ys[d]![i]!}
                highlight={tieInvolves(tie, highlightTeamId)}
              />
            )),
          )
        })}

        {/* final cell */}
        {finalTie ? (
          <TieCell tie={finalTie} x={finalX} yCenter={finalY} highlight={tieInvolves(finalTie, highlightTeamId)} />
        ) : null}
      </div>
    </div>
  )
}
