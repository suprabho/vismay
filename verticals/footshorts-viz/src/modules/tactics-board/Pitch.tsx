import { PITCH_LENGTH as L, PITCH_WIDTH as W } from './coordinates'

/**
 * Static SVG pitch markings drawn in metres (105 × 68), matching the board's
 * viewBox. Decorative — `role="presentation"` — the prose carries the meaning.
 *
 * Geometry follows the FIFA standard: 16.5 m penalty areas, 5.5 m six-yard
 * boxes, 9.15 m centre circle and penalty arcs, 7.32 m goals.
 */

interface PitchProps {
  pitchColor: string
  stripeColor: string
  lineColor: string
  lineWidth?: number
}

// Penalty-arc / box intersection: where r=9.15 around the penalty spot meets
// the 16.5 m box line. dy = sqrt(9.15² − 5.5²) ≈ 7.31.
const ARC_DY = Math.sqrt(9.15 * 9.15 - 5.5 * 5.5)
const STRIPES = 7
const STRIPE_W = L / STRIPES

export function Pitch({ pitchColor, stripeColor, lineColor, lineWidth = 0.3 }: PitchProps) {
  const line = {
    fill: 'none',
    stroke: lineColor,
    strokeWidth: lineWidth,
  } as const

  return (
    <g role="presentation">
      {/* Mowing stripes */}
      {Array.from({ length: STRIPES }, (_, i) => (
        <rect
          key={i}
          x={i * STRIPE_W}
          y={0}
          width={STRIPE_W}
          height={W}
          fill={i % 2 === 0 ? pitchColor : stripeColor}
        />
      ))}

      {/* Boundary */}
      <rect x={0} y={0} width={L} height={W} {...line} />

      {/* Halfway line + centre circle + spot */}
      <line x1={L / 2} y1={0} x2={L / 2} y2={W} {...line} />
      <circle cx={L / 2} cy={W / 2} r={9.15} {...line} />
      <circle cx={L / 2} cy={W / 2} r={0.4} fill={lineColor} stroke="none" />

      {/* Penalty areas (16.5 × 40.32) */}
      <rect x={0} y={W / 2 - 20.16} width={16.5} height={40.32} {...line} />
      <rect x={L - 16.5} y={W / 2 - 20.16} width={16.5} height={40.32} {...line} />

      {/* Six-yard boxes (5.5 × 18.32) */}
      <rect x={0} y={W / 2 - 9.16} width={5.5} height={18.32} {...line} />
      <rect x={L - 5.5} y={W / 2 - 9.16} width={5.5} height={18.32} {...line} />

      {/* Penalty spots */}
      <circle cx={11} cy={W / 2} r={0.4} fill={lineColor} stroke="none" />
      <circle cx={L - 11} cy={W / 2} r={0.4} fill={lineColor} stroke="none" />

      {/* Penalty arcs (only the part outside the box) */}
      <path d={`M 16.5 ${W / 2 - ARC_DY} A 9.15 9.15 0 0 1 16.5 ${W / 2 + ARC_DY}`} {...line} />
      <path
        d={`M ${L - 16.5} ${W / 2 - ARC_DY} A 9.15 9.15 0 0 0 ${L - 16.5} ${W / 2 + ARC_DY}`}
        {...line}
      />

      {/* Goals */}
      <rect x={-2} y={W / 2 - 3.66} width={2} height={7.32} {...line} />
      <rect x={L} y={W / 2 - 3.66} width={2} height={7.32} {...line} />

      {/* Corner arcs */}
      <path d={`M 1 0 A 1 1 0 0 1 0 1`} {...line} />
      <path d={`M ${L - 1} 0 A 1 1 0 0 0 ${L} 1`} {...line} />
      <path d={`M 1 ${W} A 1 1 0 0 0 0 ${W - 1}`} {...line} />
      <path d={`M ${L - 1} ${W} A 1 1 0 0 1 ${L} ${W - 1}`} {...line} />
    </g>
  )
}
