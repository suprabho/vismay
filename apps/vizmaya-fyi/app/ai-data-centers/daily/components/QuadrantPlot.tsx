'use client'

import { useMemo, useRef, useState } from 'react'
import type { DcPaper } from '@vismay/content-source/dcEditionTypes'
import { DC_COMPUTE_BUCKETS } from '@vismay/content-source/dcEditionTypes'
import { paperGainNorm, paperGainText, shortTitle } from '@vismay/content-source/dcEditionAssembly'

/**
 * Results at scale — papers placed by reported gain against the estimated
 * compute of the headline experiment.
 *
 * Point labels used to sit at a fixed per-index offset (a side/dy lookup
 * table). That works only by luck: when several papers land in the same
 * compute bucket with similar gains — the low-compute cluster is the repeat
 * offender — their label boxes are never checked against each other and pile
 * up unreadably. placeLabels() below replaces that with real collision
 * detection: each label tries a ring of candidate anchors around its point and
 * keeps the first one clear of every other label box, point halo and the plot
 * bounds. "Regenerate layout" re-runs it with the candidate/point order
 * shuffled, so a click can escape a bad local arrangement without changing any
 * of the underlying data.
 *
 * Label widths are estimated, never measured: canvas measureText() only exists
 * in the browser, and the first paint has to be identical on the server and
 * the client or React replaces the whole plot on hydration. PAD below absorbs
 * the drift between the estimate and the rendered glyphs.
 */

const W = 900
const H = 400
const P = { l: 64, r: 30, t: 30, b: 54 }
const YM = 25
const LINE_H = 15
const HALO_R = 18
const PAD = 5

const X = (c: number) => P.l + ((c + 0.5) / DC_COMPUTE_BUCKETS.length) * (W - P.l - P.r)
const Y = (v: number) => H - P.b - (v / YM) * (H - P.t - P.b)

const NARROW = /[ijltIJ.,:;'!|()[\]{}/\\-]/
const WIDE = /[mwMW@%]/
const CAPS = /[A-Z0-9]/
/**
 * The per-character weights below run 2–6% short of what the browser actually
 * lays out (measured against getComputedTextLength on the rendered plot), and
 * a label that is estimated short is a label the collision test clears while
 * it visibly touches its neighbour. Scaling the estimate up absorbs that:
 * over-estimating only pushes labels a little further apart.
 */
const WIDTH_CALIBRATION = 1.06

/** Proportional-width estimate for the sans label, in px at `size`. */
function sansWidth(text: string, size: number): number {
  let em = 0
  for (const ch of text) em += ch === ' ' ? 0.26 : NARROW.test(ch) ? 0.3 : WIDE.test(ch) ? 0.85 : CAPS.test(ch) ? 0.62 : 0.52
  return em * size * WIDTH_CALIBRATION
}
/** Space Mono is monospaced at 0.6em. */
const monoWidth = (text: string, size: number) => text.length * size * 0.6 * WIDTH_CALIBRATION

interface Point {
  paper: DcPaper
  i: number
  cx: number
  cy: number
  open: boolean
  name: string
  gain: string
  w: number
}

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
  anchor: 'start' | 'end'
  x: number
  y: number
  dx: number
  dy: number
}

/** Deterministic PRNG, so a given seed always yields the same layout. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function candidateAnchors(rand: (() => number) | null): { dx: number; dy: number; r: number }[] {
  const angles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
  if (rand) {
    for (let i = angles.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[angles[i], angles[j]] = [angles[j], angles[i]]
    }
  }
  const out: { dx: number; dy: number; r: number }[] = []
  for (const r of [22, 32, 44, 58, 74]) {
    for (const a of angles) {
      const rad = (a * Math.PI) / 180
      out.push({ dx: Math.cos(rad) * r, dy: Math.sin(rad) * r, r })
    }
  }
  return out
}

function labelBox(pt: Point, dx: number, dy: number): Box {
  const anchor: 'start' | 'end' = dx >= -2 ? 'start' : 'end'
  const x = pt.cx + dx + (anchor === 'start' ? 4 : -4)
  const y = pt.cy + dy
  const x0 = (anchor === 'start' ? x : x - pt.w) - PAD
  return { x0, y0: y - LINE_H * 0.75 - PAD, x1: x0 + pt.w + PAD * 2, y1: y + LINE_H * 0.35 + PAD, anchor, x, y, dx, dy }
}

const boxesOverlap = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
function overlapsHalo(box: Box, pt: Point): boolean {
  const cx = Math.max(box.x0, Math.min(pt.cx, box.x1))
  const cy = Math.max(box.y0, Math.min(pt.cy, box.y1))
  return Math.hypot(cx - pt.cx, cy - pt.cy) < HALO_R
}
const inBounds = (box: Box) => box.x0 >= P.l + 2 && box.x1 <= W - P.r - 2 && box.y0 >= P.t + 2 && box.y1 <= H - P.b - 2

function attemptLabels(points: Point[], rand: (() => number) | null): Box[] {
  const order = points.map((_, i) => i)
  if (rand) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
  }
  const labels = new Array<Box>(points.length)
  const placed: Box[] = []
  for (const idx of order) {
    const pt = points[idx]
    let best: Box | null = null
    let bestScore = Infinity
    for (const c of candidateAnchors(rand)) {
      const box = labelBox(pt, c.dx, c.dy)
      let score = inBounds(box) ? 0 : 1000
      for (const other of placed) if (boxesOverlap(box, other)) score += 100
      for (const other of points) if (other !== pt && overlapsHalo(box, other)) score += 50
      score += c.r * 0.1 // mild pull toward the point once collisions are equal
      if (score < bestScore) {
        bestScore = score
        best = box
      }
      if (bestScore === 0) break
    }
    const chosen = best as Box
    placed.push(chosen)
    labels[idx] = chosen
  }
  return labels
}

/**
 * Real outcome check — label vs label, label vs other halo, in or out of
 * bounds — independent of the greedy per-point score above, so a whole attempt
 * can be graded and an unlucky shuffle thrown away.
 */
function scoreLabels(points: Point[], labels: Box[]): number {
  let score = 0
  labels.forEach((box, idx) => {
    if (!inBounds(box)) score += 1000
    for (const other of points) if (other.i !== idx && overlapsHalo(box, other)) score += 50
  })
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) if (boxesOverlap(labels[i], labels[j])) score += 100
  }
  return score
}

function placeLabels(points: Point[], seed: number): Box[] {
  // Every pass, including the first paint, is best-of-40 shuffles — a single
  // greedy pass leaves labels stacked whenever two papers land close together,
  // and most readers never press the button. The shuffles are driven by a
  // seeded PRNG rather than Math.random so the first paint is byte-identical
  // on the server and in the browser; each press of Regenerate just moves to
  // the next seed.
  const rand = mulberry32(0x9e3779b9 + seed * 2654435761)
  let best: Box[] | null = null
  let bestScore = Infinity
  for (let a = 0; a < 40; a++) {
    const labels = attemptLabels(points, rand)
    const s = scoreLabels(points, labels)
    if (s < bestScore) {
      bestScore = s
      best = labels
    }
    if (bestScore === 0) break
  }
  return best as Box[]
}

export default function QuadrantPlot({ papers }: { papers: DcPaper[] }) {
  const [seed, setSeed] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const points = useMemo<Point[]>(
    () =>
      papers.map((paper, i) => {
        const name = shortTitle(paper.title, 28)
        const gain = `${paperGainText(paper)}${paper.bench ? ` ${shortTitle(paper.bench, 18)}` : ''}`
        return {
          paper,
          i,
          cx: X(paper.computeBucket ?? 0),
          cy: Y(Math.min(YM, paperGainNorm(paper))),
          open: paper.weightsReleased || paper.codeReleased,
          name,
          gain,
          w: sansWidth(`${name} `, 12.5) + monoWidth(`· ${gain}`, 10.5),
        }
      }),
    [papers],
  )
  const labels = useMemo(() => placeLabels(points, seed), [points, seed])

  const regenerate = () => {
    setSeed((s) => s + 1)
    setSpinning(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setSpinning(false), 500)
  }

  return (
    <>
      <div className="gcard-head">
        <div className="title-wrap">
          <span className="eyebrow">Results at scale</span>
          <span className="eyebrow dim">
            <i className="lg on" />
            weights or code released <i className="lg off" />
            closed
          </span>
        </div>
        {papers.length > 1 && (
          <button
            type="button"
            className={`pill regen${spinning ? ' spin' : ''}`}
            onClick={regenerate}
            title="Re-place the point labels. Fixed offsets can overlap when several papers share a compute bucket — this re-runs a collision-aware layout."
          >
            <span className="ico">⟳</span>
            <span className="txt">Regenerate layout</span>
          </button>
        )}
      </div>
      <svg id="quadrant" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Papers placed by reported gain over baseline and the estimated compute of the headline experiment">
        <rect x={P.l} y={P.t} width={W - P.l - P.r} height={H - P.t - P.b} className="qbg" />
        {DC_COMPUTE_BUCKETS.map((c, i) => (
          <g key={c}>
            <line x1={X(i)} y1={P.t} x2={X(i)} y2={H - P.b} className="qmid" />
            <text x={X(i)} y={H - P.b + 20} textAnchor="middle" className="qax">
              {c.replace(' FLOP', '')}
            </text>
          </g>
        ))}
        {[0, 5, 10, 15, 20, 25].map((v) => (
          <g key={v}>
            <text x={P.l - 8} y={Y(v) + 4} textAnchor="end" className="qc">
              {v}
            </text>
            <line x1={P.l} y1={Y(v)} x2={W - P.r} y2={Y(v)} className="qgrid" />
          </g>
        ))}
        <text x={(P.l + W - P.r) / 2} y={H - P.b + 40} textAnchor="middle" className="qax">
          Estimated compute behind the headline experiment (FLOP)
        </text>
        <text transform={`translate(16 ${(P.t + H - P.b) / 2}) rotate(-90)`} textAnchor="middle" className="qax">
          Gain over baseline (normalised)
        </text>
        {points.map((pt) => {
          const label = labels[pt.i]
          const leader = Math.hypot(label.dx, label.dy) > 24
          return (
            <g className="qp" data-panel={`paper:${pt.paper.arxivId}`} role="button" tabIndex={0} key={pt.paper.arxivId}>
              <circle cx={pt.cx} cy={pt.cy} r={HALO_R} className={`qhalo${pt.open ? '' : ' closed'}`} />
              <circle cx={pt.cx} cy={pt.cy} r={8} className={`qdot${pt.open ? '' : ' closed'}`} />
              <text x={pt.cx} y={pt.cy + 3.5} textAnchor="middle" className="qn">
                {pt.i + 1}
              </text>
              {leader && <line x1={pt.cx} y1={pt.cy} x2={label.x} y2={label.y - 4} className="qleader" />}
              <text x={label.x} y={label.y} textAnchor={label.anchor} className="qt">
                {pt.name} <tspan className="qc">· {pt.gain}</tspan>
              </text>
              <title>{pt.paper.title}</title>
            </g>
          )
        })}
        {papers.length === 0 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" className="qlab">
            No papers in this edition
          </text>
        )}
      </svg>
      <div className="quadrant-note">Compute buckets are estimates from the stated scale; gains are normalised across benchmark points, multipliers and percentages.</div>
    </>
  )
}
