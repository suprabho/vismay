'use client'

import { useChartColors, useIsMobile } from '@/lib/chartTheme'

const plants = [
  {
    id: 1,
    label: 'Helium 1',
    capacity: '660M scf/yr',
    online: '2005',
    x: 300,
    y: 180,
    r: 28,
    share: 9.2,
  },
  {
    id: 2,
    label: 'Helium 2',
    capacity: '1,300M scf/yr',
    online: '2013',
    x: 460,
    y: 150,
    r: 42,
    share: 18.2,
    note: "World's largest",
  },
  {
    id: 3,
    label: 'Helium 3',
    capacity: '400M scf/yr',
    online: '2021',
    x: 380,
    y: 265,
    r: 22,
    share: 5.6,
  },
]

const TITLES: Record<number, string> = {
  0: 'Ras Laffan, Qatar — three helium plants, 33% of global supply',
  1: 'All three plants offline since March 2 — when gas stops, helium stops',
  2: '33% of global helium supply removed in a single week',
}

export default function QatarPlantMap({ activeStep }: { activeStep: number }) {
  const { red: RED, green: TEAL, muted: MUTED, line: LINE, surface: SURFACE } = useChartColors()
  const mobile = useIsMobile()
  const title = TITLES[activeStep] ?? TITLES[0]
  const isOffline = activeStep >= 1
  const showImpact = activeStep >= 2

  return (
    <div className="w-full h-full flex flex-col">
      <div
        className="text-center mb-3 shrink-0"
        style={{ fontFamily: 'var(--font-mono)', fontSize: mobile ? '0.55rem' : '0.7rem', color: MUTED }}
      >
        {title}
      </div>

      <svg viewBox={mobile ? "20 0 720 420" : "0 0 760 420"} className="w-full flex-1" preserveAspectRatio="xMidYMid meet">
        {/* Background: simplified Gulf map outline */}
        <rect x="0" y="0" width="760" height="420" fill="transparent" />

        {/* Sea */}
        <ellipse cx="580" cy="200" rx="160" ry="110" fill="#0d1a2a" opacity="0.6" />
        <text x="590" y="205" fill={MUTED} fontSize="10" fontFamily="var(--font-mono)" textAnchor="middle" opacity="0.5">
          Persian Gulf
        </text>

        {/* Qatar peninsula (simplified) */}
        <path
          d="M 320 320 Q 340 310 360 290 Q 390 260 410 230 Q 430 210 440 190
             Q 450 175 440 165 Q 420 150 400 150 Q 370 148 350 155
             Q 330 160 315 175 Q 300 190 290 210
             Q 280 235 285 260 Q 290 290 305 310 Z"
          fill={SURFACE}
          stroke={LINE}
          strokeWidth="1"
        />
        <text x="348" y="325" fill={MUTED} fontSize="11" fontFamily="var(--font-sans)" textAnchor="middle" opacity="0.6">
          Qatar
        </text>

        {/* Ras Laffan industrial city label */}
        <text x="250" y="115" fill={MUTED} fontSize="9" fontFamily="var(--font-mono)" opacity="0.7">
          Ras Laffan
        </text>
        <text x="250" y="128" fill={MUTED} fontSize="9" fontFamily="var(--font-mono)" opacity="0.7">
          Industrial City
        </text>
        <line x1="295" y1="125" x2="308" y2="158" stroke={MUTED} strokeWidth="0.5" strokeDasharray="3 2" opacity="0.5" />

        {/* Flow lines: plants → export arrow */}
        {plants.map((p) => (
          <line
            key={p.id}
            x1={p.x}
            y1={p.y}
            x2={620}
            y2={200}
            stroke={isOffline ? RED : TEAL}
            strokeWidth={0.8}
            strokeDasharray="4 3"
            opacity={isOffline ? 0.3 : 0.5}
          />
        ))}

        {/* Export label */}
        <text x="645" y="175" fill={isOffline ? RED : TEAL} fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">
          {isOffline ? 'EXPORTS' : 'to global'}
        </text>
        <text x="645" y="188" fill={isOffline ? RED : TEAL} fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">
          {isOffline ? 'HALTED' : 'market'}
        </text>
        {/* Arrow */}
        <path
          d="M 630 195 L 650 205 L 630 215"
          fill="none"
          stroke={isOffline ? RED : TEAL}
          strokeWidth="1.5"
          opacity={isOffline ? 0.5 : 0.7}
        />

        {/* Plant circles */}
        {plants.map((p) => (
          <g key={p.id}>
            {/* Glow ring when offline */}
            {isOffline && (
              <circle
                cx={p.x}
                cy={p.y}
                r={p.r + 8}
                fill="none"
                stroke={RED}
                strokeWidth="1"
                opacity="0.25"
              />
            )}
            {/* Main circle */}
            <circle
              cx={p.x}
              cy={p.y}
              r={p.r}
              fill={isOffline ? RED : TEAL}
              opacity={isOffline ? 0.2 : 0.25}
              stroke={isOffline ? RED : TEAL}
              strokeWidth="1"
            />
            {/* Status indicator */}
            <circle
              cx={p.x + p.r - 8}
              cy={p.y - p.r + 8}
              r={5}
              fill={isOffline ? RED : TEAL}
              opacity="0.9"
            />
            {/* Plant label */}
            <text
              x={p.x}
              y={p.y - 4}
              textAnchor="middle"
              fill="#fff"
              fontSize="10"
              fontFamily="var(--font-sans)"
              fontWeight="600"
            >
              {p.label}
            </text>
            <text
              x={p.x}
              y={p.y + 10}
              textAnchor="middle"
              fill={isOffline ? RED : TEAL}
              fontSize="9"
              fontFamily="var(--font-mono)"
              fontWeight="700"
            >
              {isOffline ? 'OFFLINE' : p.capacity}
            </text>
            {/* Capacity below when online */}
            {!isOffline && (
              <text
                x={p.x}
                y={p.y + 23}
                textAnchor="middle"
                fill={MUTED}
                fontSize="8"
                fontFamily="var(--font-mono)"
              >
                online {p.online}
              </text>
            )}
          </g>
        ))}

        {/* Combined impact badge */}
        {showImpact && (
          <g>
            <rect x="20" y="20" width="220" height="70" rx="6" fill={SURFACE} stroke={RED} strokeWidth="0.5" opacity="0.9" />
            <text x="130" y="42" textAnchor="middle" fill={RED} fontSize="10" fontFamily="var(--font-mono)" fontWeight="700">
              COMBINED OUTPUT OFFLINE
            </text>
            <text x="130" y="60" textAnchor="middle" fill="#fff" fontSize="22" fontFamily="var(--font-mono)" fontWeight="700">
              2,360M scf/yr
            </text>
            <text x="130" y="80" textAnchor="middle" fill={MUTED} fontSize="9" fontFamily="var(--font-mono)">
              = 33.2% of global helium supply
            </text>
          </g>
        )}

        {/* Legend */}
        <g transform="translate(555, 330)">
          <circle cx="8" cy="8" r="6" fill={TEAL} opacity="0.7" />
          <text x="18" y="12" fill={MUTED} fontSize="9" fontFamily="var(--font-mono)">Operational</text>
          <circle cx="8" cy="28" r="6" fill={RED} opacity="0.7" />
          <text x="18" y="32" fill={MUTED} fontSize="9" fontFamily="var(--font-mono)">Offline</text>
          <text x="0" y="50" fill={MUTED} fontSize="8" fontFamily="var(--font-mono)">Circle size ∝ capacity</text>
        </g>
      </svg>

      <div
        className="text-center mt-1 shrink-0"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--color-chrome-text-muted)' }}
      >
        Sources: USGS 2026 Mineral Commodity Summaries (33.2% of global supply). Plant data: Gasworld, Helium One.
      </div>
    </div>
  )
}
