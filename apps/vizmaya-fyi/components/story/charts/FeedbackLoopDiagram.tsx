'use client'

import { useChartColors, useIsMobile } from '@/lib/chartTheme'

const edges = [
  { from: 0, to: 1 },
  { from: 0, to: 2 },
  { from: 1, to: 3 },
  { from: 2, to: 4 },
  { from: 3, to: 5 },
  { from: 4, to: 5 },
]

const breakers = [
  { x: 50, y: 290, label: '+ Nuclear restart' },
  { x: 50, y: 318, label: '+ ~60 idle carriers' },
  { x: 50, y: 346, label: '+ Coal easing' },
]

const TITLES: Record<number, string> = {
  0: 'The doom loop: energy crisis \u2192 carrier shortage \u2192 deeper energy crisis',
  1: 'Circuit breakers slow the loop \u2014 but cannot stop it if the war extends years',
}

export default function FeedbackLoopDiagram({ activeStep }: { activeStep: number }) {
  const { red: RED, amber: AMBER, accent: ACCENT, green: TEAL, muted: MUTED } = useChartColors()
  const mobile = useIsMobile()

  const nodes = [
    { x: 400, y: 60, w: 220, h: 44, label: 'Hormuz closure', c: RED },
    { x: 150, y: 170, w: 200, h: 44, label: 'Korean energy crisis', c: AMBER },
    { x: 650, y: 170, w: 200, h: 44, label: 'Qatar helium offline', c: AMBER },
    { x: 150, y: 290, w: 200, h: 44, label: 'Shipyard pressure', c: ACCENT },
    { x: 650, y: 290, w: 200, h: 44, label: 'Fab utilisation cuts', c: ACCENT },
    { x: 400, y: 370, w: 260, h: 36, label: 'Global LNG shortage deepens', c: RED },
  ]

  const title = TITLES[activeStep] ?? TITLES[0]
  const showBreakers = activeStep >= 1

  return (
    <div className="w-full h-full flex flex-col">
      <div
        className="text-center mb-2 shrink-0"
        style={{ fontFamily: 'var(--font-mono)', fontSize: mobile ? '0.55rem' : '0.7rem', color: MUTED }}
      >
        {title}
      </div>
      <svg viewBox={mobile ? "40 0 720 420" : "0 0 800 420"} className="w-full flex-1" preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker
            id="arrowhead"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path
              d="M2 1L8 5L2 9"
              fill="none"
              stroke={MUTED}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </marker>
          <marker
            id="arrowhead-red"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path
              d="M2 1L8 5L2 9"
              fill="none"
              stroke={RED}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((e, i) => {
          const f = nodes[e.from]
          const t = nodes[e.to]
          return (
            <line
              key={i}
              x1={f.x}
              y1={f.y + f.h}
              x2={t.x}
              y2={t.y}
              stroke={MUTED}
              strokeWidth={1.5}
              markerEnd="url(#arrowhead)"
              opacity={0.6}
            />
          )
        })}

        {/* Feedback loop arrow */}
        <path
          d="M 270 388 Q 30 388 30 230 Q 30 170 150 170"
          fill="none"
          stroke={RED}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          markerEnd="url(#arrowhead-red)"
          opacity={0.5}
        />
        <text
          x={22}
          y={230}
          fill={RED}
          fontSize="9px"
          fontFamily="var(--font-mono)"
          transform="rotate(-90,22,230)"
        >
          feedback
        </text>

        {/* Nodes */}
        {nodes.map((n, i) => (
          <g key={i}>
            <rect
              x={n.x - n.w / 2}
              y={n.y}
              width={n.w}
              height={n.h}
              rx={6}
              fill={n.c}
              opacity={0.15}
              stroke={n.c}
              strokeWidth={0.5}
            />
            <text
              x={n.x}
              y={n.y + n.h / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#fff"
              fontSize="12px"
              fontFamily="var(--font-sans)"
            >
              {n.label}
            </text>
          </g>
        ))}

        {/* Circuit breakers */}
        {showBreakers &&
          breakers.map((b, i) => (
            <text
              key={i}
              x={b.x}
              y={b.y}
              fill={TEAL}
              fontSize="10px"
              fontFamily="var(--font-mono)"
              style={{
                transition: 'opacity 0.5s',
                opacity: showBreakers ? 1 : 0,
              }}
            >
              {b.label}
            </text>
          ))}
      </svg>
      <div
        className="text-center mt-1 shrink-0"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--color-chrome-text-muted)' }}
      >
        Feedback loop model. Circuit breakers shown in green. Positive feedback in red.
      </div>
    </div>
  )
}
