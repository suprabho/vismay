import { useMemo } from 'react'
import type { CircuitGeometry } from '@/lib/replay/types'
import { buildProjector } from '@/lib/replay/trackProjection'

export type SectorColor = 'neutral' | 'pb' | 'purple'

interface Props {
  circuit: CircuitGeometry
  viewportW: number
  viewportH: number
  /** Colour key per sector index (0=s1, 1=s2, 2=s3). */
  sectorColors: [SectorColor, SectorColor, SectorColor]
}

// Tuned for vizf1's dark canvas (bg #0b0d12 / surface #13161d).
const COLOR_MAP: Record<SectorColor, string> = {
  neutral: '#6b7280',
  pb: '#22C55E',
  purple: '#A855F7',
}
const HALO = '#aab2c5'

function pathFromSlice(
  ox: number[],
  oy: number[],
  from: number,
  to: number,
  project: (x: number, y: number) => { sx: number; sy: number },
): string {
  if (to <= from) return ''
  const parts: string[] = []
  for (let i = from; i <= to && i < ox.length; i++) {
    const p = project(ox[i], oy[i])
    parts.push(`${i === from ? 'M' : 'L'}${p.sx.toFixed(1)} ${p.sy.toFixed(1)}`)
  }
  return parts.join(' ')
}

/**
 * Renders the circuit outline either as a single neutral path (when sector
 * boundaries are missing) or as three coloured segments. The halo (faint thick
 * stroke) is always drawn underneath for depth.
 */
export function SectorOutline({ circuit, viewportW, viewportH, sectorColors }: Props) {
  const projector = useMemo(
    () => buildProjector(circuit, { width: viewportW, height: viewportH, padding: 32 }),
    [circuit, viewportW, viewportH],
  )

  const ox = circuit.outline.x
  const oy = circuit.outline.y
  const sb = circuit.sectorBoundaries

  if (!ox.length || ox.length !== oy.length) return null

  // Fallback: single segment if boundaries are missing or invalid
  if (!sb || sb.index1 <= 0 || sb.index2 <= sb.index1 || sb.index2 >= ox.length - 1) {
    return (
      <>
        <path
          d={projector.outlinePath}
          fill="none"
          stroke={HALO}
          strokeWidth={7}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.12}
        />
        <path
          d={projector.outlinePath}
          fill="none"
          stroke={COLOR_MAP.neutral}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </>
    )
  }

  // Three coloured slices
  const last = ox.length - 1
  const s1 = pathFromSlice(ox, oy, 0, sb.index1, projector.project)
  const s2 = pathFromSlice(ox, oy, sb.index1, sb.index2, projector.project)
  // Sector 3 wraps from boundary2 back to start (closing the loop)
  const s3pre = pathFromSlice(ox, oy, sb.index2, last, projector.project)
  const closePt = projector.project(ox[0], oy[0])
  const s3 = s3pre ? `${s3pre} L${closePt.sx.toFixed(1)} ${closePt.sy.toFixed(1)}` : ''

  const stroke = (key: SectorColor) => COLOR_MAP[key]

  return (
    <>
      <path
        d={projector.outlinePath}
        fill="none"
        stroke={HALO}
        strokeWidth={7}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.12}
      />
      <path d={s1} fill="none" stroke={stroke(sectorColors[0])} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <path d={s2} fill="none" stroke={stroke(sectorColors[1])} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <path d={s3} fill="none" stroke={stroke(sectorColors[2])} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

      {(() => {
        const p1 = projector.project(ox[sb.index1], oy[sb.index1])
        const p2 = projector.project(ox[sb.index2], oy[sb.index2])
        return (
          <>
            <circle cx={p1.sx} cy={p1.sy} r={3.5} fill="#fff" stroke="#0b0d12" strokeWidth={1} />
            <circle cx={p2.sx} cy={p2.sy} r={3.5} fill="#fff" stroke="#0b0d12" strokeWidth={1} />
            <text x={p1.sx + 6} y={p1.sy - 6} fontSize={9} fontFamily="monospace" fill="#8e8e99" fontWeight={700}>
              S1/S2
            </text>
            <text x={p2.sx + 6} y={p2.sy - 6} fontSize={9} fontFamily="monospace" fill="#8e8e99" fontWeight={700}>
              S2/S3
            </text>
          </>
        )
      })()}
    </>
  )
}
