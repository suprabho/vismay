import { dataToSvg } from './coordinates'

/**
 * A single player token: a coloured disc with a short label, positioned from
 * data coordinates (0–100). Sized in pitch metres so it scales with the board.
 */

interface PlayerProps {
  x: number
  y: number
  color: string
  textColor: string
  label: string
  radius?: number
}

export function Player({ x, y, color, textColor, label, radius = 2.4 }: PlayerProps) {
  const p = dataToSvg(x, y)
  // Keep labels legible: shrink the font as the label gets longer.
  const fontSize = label.length <= 2 ? 2.3 : label.length === 3 ? 1.9 : 1.6
  return (
    <g>
      <circle
        cx={p.x}
        cy={p.y}
        r={radius}
        fill={color}
        stroke="rgba(0,0,0,0.35)"
        strokeWidth={0.35}
      />
      <text
        x={p.x}
        y={p.y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight={700}
        fill={textColor}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {label}
      </text>
    </g>
  )
}
