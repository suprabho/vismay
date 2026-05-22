'use client'

export interface Wire {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * SVG wire layer rendered INSIDE the canvas transform so paths pan/zoom
 * with everything else. The SVG itself is 1x1 with `overflow: visible` —
 * a deliberate hack so we don't need to track the bounding extent of all
 * wires. `vector-effect: non-scaling-stroke` keeps strokes readable at
 * deep zoom-out.
 *
 * Each path is a cubic Bezier from `(x1,y1)` to `(x2,y2)` with control
 * points pulled horizontally toward the midpoint. Standard node-graph
 * wire — looks like ComfyUI / RetoolFlow / the user's reference diagram.
 */
export default function CanvasWires({ wires }: { wires: Wire[] }) {
  if (wires.length === 0) return null
  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: 1,
        height: 1,
        overflow: 'visible',
        pointerEvents: 'none',
      }}
    >
      {wires.map((w) => {
        const dx = Math.max(60, (w.x2 - w.x1) * 0.5)
        const d = `M ${w.x1},${w.y1} C ${w.x1 + dx},${w.y1} ${w.x2 - dx},${w.y2} ${w.x2},${w.y2}`
        return (
          <path
            key={w.id}
            d={d}
            fill="none"
            stroke="#4a4a4a"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
    </svg>
  )
}
