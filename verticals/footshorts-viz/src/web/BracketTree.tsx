'use client'

import { useEffect, useState } from 'react'
import type { Bracket as BracketModel, BracketRound, BracketTie, FixtureTeamRef } from '../types'
import { stageLabel } from '../stageLabel'
import { Crest } from '../data/Crest'
import { findTeam } from '../data/teams'
import { getCompetitionDisplayName, getCompetitionPalette } from '../competitionMeta'

/**
 * Tournament bracket (web only — see modules/bracket/Component.tsx).
 *
 * Responsive: by default (`orientation="auto"`) it renders the classic
 * broadcast-style mirrored draw — outer rounds flowing inward on the left
 * (R16 → QF → SF), a centre final + competition emblem, and the right half
 * mirrored — but on narrow/portrait viewports it switches to a vertical
 * top-to-bottom cascade that fits a phone without horizontal scrolling.
 * `orientation` can force either layout. One team's run can be highlighted via
 * `highlightTeamId`.
 *
 * Implementation: both layouts are absolutely-positioned HTML cells over a
 * single SVG connector layer. Deliberately NOT <foreignObject> — that
 * mis-renders in the Playwright/Chromium slides/report/video capture pipeline
 * this story targets. The narrow-viewport switch is SSR/capture-safe (defaults
 * to the wide tree until a real narrow client viewport is measured).
 */

export type BracketOrientation = 'auto' | 'horizontal' | 'vertical'

type Props = {
  bracket: BracketModel
  highlightTeamId?: string
  title?: string
  competitionSlug?: string
  /** 'auto' (default) picks vertical on narrow viewports; otherwise forced. */
  orientation?: BracketOrientation
}

const CELL_W = 184
const CELL_H = 52

// Horizontal (mirrored tree) geometry.
const COL_GAP = 44
const ROW_GAP = 20
const PAD = 20
const HEADER_H = 30
const COL_W = CELL_W + COL_GAP
const SLOT = CELL_H + ROW_GAP
const TOP = PAD + HEADER_H

// Vertical (cascade) geometry.
const V_PAD = 8
const V_ROW_GAP = 12
const V_LABEL_H = 20
const V_INDENT = 16
const V_SPINE_GAP = 8

// Below this width the mirrored tree forces horizontal scrolling, so an
// `auto` bracket falls back to the vertical layout.
const NARROW_QUERY = '(max-width: 640px)'

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

// SSR/capture-safe: starts false (horizontal) so server render and the
// Playwright/Chromium capture pipeline keep the wide tree; only a real narrow
// client viewport flips it.
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(NARROW_QUERY)
    const update = () => setNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return narrow
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
  top,
  highlight,
}: {
  tie: BracketTie
  x: number
  top: number
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
        top,
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

// ---------------------------------------------------------------------------
// Horizontal: the classic mirrored tournament tree.
// ---------------------------------------------------------------------------

function HorizontalTree({ bracket, highlightTeamId, title, competitionSlug }: Omit<Props, 'orientation'>) {
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

  // The centre emblem + title sit above the final cell. In a shallow draw the
  // final sits high enough that they'd collide with it, so shift the whole tree
  // down to reserve headroom (deep draws already have room → extraTop = 0).
  const naturalFinalY =
    leftYs[nDepth - 1]?.[0] != null && rightYs[nDepth - 1]?.[0] != null
      ? (leftYs[nDepth - 1]![0]! + rightYs[nDepth - 1]![0]!) / 2
      : TOP + 2 * SLOT
  const EMBLEM_HEADROOM = PAD + HEADER_H + CELL_H / 2 + 78
  const extraTop = Math.max(0, EMBLEM_HEADROOM - naturalFinalY)
  if (extraTop > 0) {
    for (const col of leftYs) for (let i = 0; i < col.length; i++) col[i] = col[i]! + extraTop
    for (const col of rightYs) for (let i = 0; i < col.length; i++) col[i] = col[i]! + extraTop
  }

  // Final cell centre = midpoint of the two semifinal cells.
  const sfLeftY = leftYs[nDepth - 1]?.[0]
  const sfRightY = rightYs[nDepth - 1]?.[0]
  const finalY = sfLeftY != null && sfRightY != null ? (sfLeftY + sfRightY) / 2 : naturalFinalY + extraTop

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
                top={ys[d]![i]! - CELL_H / 2}
                highlight={tieInvolves(tie, highlightTeamId)}
              />
            )),
          )
        })}

        {/* final cell */}
        {finalTie ? (
          <TieCell tie={finalTie} x={finalX} top={finalY - CELL_H / 2} highlight={tieInvolves(finalTie, highlightTeamId)} />
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vertical: a mobile top-to-bottom cascade.
//
// The bracket is treated as a binary tree (final = root, paired feeders
// 2j / 2j+1 of the previous round = children — the same pairing the horizontal
// tree uses). Ties are emitted in post-order, so each tie's two feeders sit
// above it and the winner cascades downward; deeper rounds step in to the
// right. Connectors route through a thin left gutter (clear of every cell) as
// an SVG comb so they never cross a card.
// ---------------------------------------------------------------------------

type VNode = { tie: BracketTie; depth: number; children: VNode[] }
type VPlaced = VNode & { yTop: number; yCenter: number; showLabel: boolean }

function VerticalTree({ bracket, highlightTeamId, title, competitionSlug }: Omit<Props, 'orientation'>) {
  const slug = competitionSlug ?? bracket.competition_slug
  const emblemColor = getCompetitionPalette(slug) ?? '#0E1E5B'
  const compName = getCompetitionDisplayName(slug)

  const rounds: BracketRound[] = bracket.rounds
  const lastIdx = rounds.length - 1
  const maxDepth = lastIdx

  // Build the bracket as a binary tree. Parent (round r, tie j) is fed by ties
  // 2j and 2j+1 of round r-1. Missing feeders (imperfect draws / byes) simply
  // produce fewer children.
  const build = (roundIdx: number, tieIdx: number): VNode | null => {
    const tie = rounds[roundIdx]?.ties[tieIdx]
    if (!tie) return null
    const children: VNode[] = []
    if (roundIdx > 0) {
      for (const f of [2 * tieIdx, 2 * tieIdx + 1]) {
        const child = build(roundIdx - 1, f)
        if (child) children.push(child)
      }
    }
    return { tie, depth: roundIdx, children }
  }
  const roots = rounds[lastIdx]!.ties.map((_, i) => build(lastIdx, i)).filter((n): n is VNode => n !== null)

  // Post-order placement: feeders first (above), then their parent (below).
  // `placedByNode` is keyed by the original node so connectors can resolve each
  // parent's children back to their placed positions.
  const placed: VPlaced[] = []
  const placedByNode = new Map<VNode, VPlaced>()
  let y = V_PAD
  let prevDepth: number | null = null
  const place = (node: VNode) => {
    for (const c of node.children) place(c)
    const showLabel = prevDepth !== node.depth
    if (showLabel) y += V_LABEL_H
    const p: VPlaced = { ...node, yTop: y, yCenter: y + CELL_H / 2, showLabel }
    placed.push(p)
    placedByNode.set(node, p)
    prevDepth = node.depth
    y += CELL_H + V_ROW_GAP
  }
  for (const r of roots) place(r)
  const totalH = y - V_ROW_GAP + V_PAD

  // Cells step in to the right with depth; a thin left gutter holds connectors.
  const leftGutter = maxDepth * V_SPINE_GAP + 6
  const cellX = (depth: number) => leftGutter + depth * V_INDENT
  // Parents at the same depth have disjoint vertical ranges (separate subtrees),
  // so one spine column per depth never visually collides.
  const spineX = (depth: number) => leftGutter - (depth - 1) * V_SPINE_GAP - V_SPINE_GAP
  const totalW = cellX(maxDepth) + CELL_W + V_PAD

  // Connector comb: for each parent, a vertical spine in the gutter joined to
  // each feeder (and to the parent) by a horizontal stub at the cell's left edge.
  type Seg = { key: string; d: string; on: boolean }
  const segs: Seg[] = []
  for (const parent of placed) {
    if (parent.children.length === 0) continue
    const sx = spineX(parent.depth)
    parent.children.forEach((child, k) => {
      const cp = placedByNode.get(child)
      if (!cp) return
      const on = tieInvolves(parent.tie, highlightTeamId) && tieInvolves(child.tie, highlightTeamId)
      // Stub from the feeder's left edge in to the spine.
      segs.push({ key: `s-${parent.depth}-${parent.yTop}-${k}`, d: `M ${cellX(child.depth)},${cp.yCenter} H ${sx}`, on })
      // The portion of the spine spanning this feeder down to the parent.
      segs.push({ key: `v-${parent.depth}-${parent.yTop}-${k}`, d: `M ${sx},${cp.yCenter} V ${parent.yCenter}`, on })
    })
    // Stub from the spine in to the parent's left edge.
    const onParent = parent.children.some(
      (c) => tieInvolves(parent.tie, highlightTeamId) && tieInvolves(c.tie, highlightTeamId),
    )
    segs.push({ key: `p-${parent.depth}-${parent.yTop}`, d: `M ${sx},${parent.yCenter} H ${cellX(parent.depth)}`, on: onParent })
  }

  return (
    <div className="w-full">
      {/* header: competition emblem + title */}
      <div className="mb-3 flex items-center gap-2 px-1">
        <div
          className="flex shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{
            width: 28,
            height: 28,
            background: emblemColor,
            border: '2px solid rgba(255,255,255,0.25)',
            boxShadow: '0 4px 12px -6px rgba(0,0,0,0.6)',
          }}
          aria-label={compName}
        >
          ★
        </div>
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold text-text/85">{title ?? compName}</div>
          {title ? <div className="truncate text-[10px] text-text/55">{compName}</div> : null}
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <div className="relative mx-auto" style={{ width: totalW, height: totalH }}>
          {/* connector layer */}
          <svg
            width={totalW}
            height={totalH}
            className="absolute inset-0"
            style={{ pointerEvents: 'none', zIndex: 0, overflow: 'visible' }}
          >
            {segs.map((s) => (
              <path
                key={s.key}
                d={s.d}
                fill="none"
                stroke={s.on ? 'var(--color-accent, #e2117a)' : 'rgba(255,255,255,0.22)'}
                strokeWidth={s.on ? 2 : 1}
              />
            ))}
          </svg>

          {/* stage labels */}
          {placed
            .filter((p) => p.showLabel)
            .map((p) => (
              <div
                key={`lbl-${p.depth}-${p.yTop}`}
                className="absolute text-[10px] font-bold uppercase tracking-[1.6px] text-text/70"
                style={{ left: cellX(p.depth), top: p.yTop - V_LABEL_H, zIndex: 5 }}
              >
                {stageLabel(p.tie.stage)}
              </div>
            ))}

          {/* tie cells */}
          {placed.map((p) => (
            <TieCell
              key={`${p.depth}-${p.yTop}-${p.tie.legs.map((l) => l.id).join('|')}`}
              tie={p.tie}
              x={cellX(p.depth)}
              top={p.yTop}
              highlight={tieInvolves(p.tie, highlightTeamId)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export function BracketTree({ orientation = 'auto', ...rest }: Props) {
  const isNarrow = useIsNarrow()
  if (rest.bracket.rounds.length === 0) return null
  const vertical = orientation === 'vertical' || (orientation === 'auto' && isNarrow)
  return vertical ? <VerticalTree {...rest} /> : <HorizontalTree {...rest} />
}
