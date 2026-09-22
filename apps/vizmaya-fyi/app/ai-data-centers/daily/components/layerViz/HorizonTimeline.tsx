import type { HorizonViz } from '@vismay/content-source/dcEditionTypes'
import { fitMono } from '../editionUtils'

/** Semiconductors — per-supplier booked-out window on a timeline, plus point events. */
export default function HorizonTimeline({ viz }: { viz: HorizonViz }) {
  const { t0, t1, today, rows } = viz
  const W = 480
  const L = 150
  const X = (t: number) => L + ((t - t0) / (t1 - t0)) * (W - L - 16)
  const rh = 30
  const H = rows.length * rh + 40
  const years: number[] = []
  for (let y = Math.ceil(t0); y <= Math.floor(t1); y++) years.push(y)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="lviz" role="img" aria-label="How far out each supplier says it is booked">
      {years.map((yr) => (
        <g key={yr}>
          <line x1={X(yr)} y1={18} x2={X(yr)} y2={H - 24} className="vgrid" />
          <text x={X(yr)} y={12} textAnchor="middle" className="vh">
            {yr}
          </text>
        </g>
      ))}
      <line x1={X(today)} y1={18} x2={X(today)} y2={H - 24} className="vnow" />
      <text x={X(today) + 4} y={H - 12} className="vk">
        today
      </text>
      {rows.map((r, i) => {
        const y = 24 + i * rh
        const barW = Math.max(4, X(r.to) - X(r.from))
        const inner = fitMono(r.desc, barW - 14)
        const after = inner ? '' : fitMono(r.desc, W - 16 - X(r.to) - 8)
        return (
          <g key={`${r.storyId}-${i}`}>
            <text x={L - 10} y={y + 14} textAnchor="end" className="vl">
              {r.label}
            </text>
            {r.style === 'mark' ? (
              <>
                <circle cx={X(r.from)} cy={y + 10} r={7} className="vdot" />
                <text x={X(r.from) + 14} y={y + 14} className="vv">
                  {fitMono(r.desc, W - 16 - X(r.from) - 14)}
                </text>
              </>
            ) : (
              <>
                <rect x={X(r.from)} y={y + 3} width={barW} height={14} rx={3} className={`vb ${r.style === 'later' ? 'later' : 'add'}`}>
                  <title>{`${r.label}: ${r.desc}`}</title>
                </rect>
                {inner ? (
                  <text x={X(r.from) + 8} y={y + 14} className="vin">
                    {inner}
                  </text>
                ) : (
                  <text x={X(r.to) + 8} y={y + 14} className="vv">
                    {after}
                  </text>
                )}
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}
