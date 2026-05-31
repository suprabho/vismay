'use client'

import type { Bracket as BracketModel, BracketRound, BracketTie, FixtureTeamRef } from '../types'
import { stageLabel } from '../stageLabel'
import { Crest } from '../data/Crest'
import { findTeam } from '../data/teams'
import { getCompetitionDisplayName, getCompetitionPalette } from '../competitionMeta'

/**
 * Mobile-friendly vertical tournament bracket (web only — see
 * modules/bracket/Component.tsx).
 *
 * The mirrored {@link BracketTree} reads left→right and is too wide for a phone:
 * it forces horizontal scrolling. This variant reads top→bottom in a single
 * narrow column, so a full draw fits a portrait viewport with ordinary vertical
 * scrolling.
 *
 * Layout: the bracket is treated as a binary tree (final = root, paired feeders
 * 2j / 2j+1 of the previous round = children — the same pairing the horizontal
 * tree uses). Ties are emitted in post-order, so each tie's two feeders sit
 * above it and the winner cascades downward; deeper rounds step in to the right.
 * A small stage label is printed whenever the round changes. Connectors are
 * routed through a thin left gutter (clear of every cell) as an SVG comb so they
 * never cross a card. One team's run can be highlighted via `highlightTeamId`.
 *
 * Implementation mirrors BracketTree: absolutely-positioned HTML cells over a
 * single SVG connector layer (deliberately NOT <foreignObject>, which
 * mis-renders in the Playwright/Chromium capture pipeline).
 */

type Props = {
  bracket: BracketModel
  highlightTeamId?: string
  title?: string
  competitionSlug?: string
}

const CELL_W = 172
const CELL_H = 52
const ROW_GAP = 12
const LABEL_H = 20
const INDENT = 16
const SPINE_GAP = 8
const PAD = 8

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
  yTop,
  highlight,
}: {
  tie: BracketTie
  x: number
  yTop: number
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
        top: yTop,
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

// A node in the bracket tree. `depth` is the round index (0 = first/outermost
// round = the leaves at the top; the final has the largest depth).
type Node = {
  tie: BracketTie
  depth: number
  children: Node[]
}

// A placed node, after post-order layout assigns it a vertical position.
type Placed = Node & {
  yTop: number
  yCenter: number
  /** True when this node opens a new round and should print a stage label. */
  showLabel: boolean
}

export function BracketTreeVertical({ bracket, highlightTeamId, title, competitionSlug }: Props) {
  if (bracket.rounds.length === 0) return null

  const slug = competitionSlug ?? bracket.competition_slug
  const emblemColor = getCompetitionPalette(slug) ?? '#0E1E5B'
  const compName = getCompetitionDisplayName(slug)

  const rounds: BracketRound[] = bracket.rounds
  const lastIdx = rounds.length - 1
  const maxDepth = lastIdx

  // Build the bracket as a binary tree. Parent (round r, tie j) is fed by ties
  // 2j and 2j+1 of round r-1 — the same pairing BracketTree relies on. Missing
  // feeders (imperfect draws / byes) simply produce fewer children.
  const build = (roundIdx: number, tieIdx: number): Node | null => {
    const tie = rounds[roundIdx]?.ties[tieIdx]
    if (!tie) return null
    const children: Node[] = []
    if (roundIdx > 0) {
      for (const f of [2 * tieIdx, 2 * tieIdx + 1]) {
        const child = build(roundIdx - 1, f)
        if (child) children.push(child)
      }
    }
    return { tie, depth: roundIdx, children }
  }
  const roots = rounds[lastIdx]!.ties.map((_, i) => build(lastIdx, i)).filter((n): n is Node => n !== null)

  // Post-order placement: feeders first (above), then their parent (below).
  // `placedByNode` is keyed by the original Node so connectors can resolve each
  // parent's children back to their placed positions.
  const placed: Placed[] = []
  const placedByNode = new Map<Node, Placed>()
  let y = PAD
  let prevDepth: number | null = null
  const place = (node: Node) => {
    for (const c of node.children) place(c)
    const showLabel = prevDepth !== node.depth
    if (showLabel) y += LABEL_H
    const p: Placed = { ...node, yTop: y, yCenter: y + CELL_H / 2, showLabel }
    placed.push(p)
    placedByNode.set(node, p)
    prevDepth = node.depth
    y += CELL_H + ROW_GAP
  }
  for (const r of roots) place(r)
  const totalH = y - ROW_GAP + PAD

  // Cells step in to the right with depth; a thin left gutter holds connectors.
  const leftGutter = maxDepth * SPINE_GAP + 6
  const cellX = (depth: number) => leftGutter + depth * INDENT
  // Parents at the same depth have disjoint vertical ranges (separate subtrees),
  // so one spine column per depth never visually collides.
  const spineX = (depth: number) => leftGutter - (depth - 1) * SPINE_GAP - SPINE_GAP
  const totalW = cellX(maxDepth) + CELL_W + PAD

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
                style={{ left: cellX(p.depth), top: p.yTop - LABEL_H, zIndex: 5 }}
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
              yTop={p.yTop}
              highlight={tieInvolves(p.tie, highlightTeamId)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
