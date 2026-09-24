import type { OrdersViz } from '@vismay/content-source/dcEditionTypes'
import { fitMono } from '../editionUtils'

/** Semi equipment — pull-forwards as arrows, windows as bars, risks in the negative colour. */
export default function OrderTimeline({ viz, id }: { viz: OrdersViz; id: string }) {
  const { t0, t1, today, rows } = viz
  const W = 480
  const L = 150
  const X = (t: number) => L + ((t - t0) / (t1 - t0)) * (W - L - 16)
  const rh = 30
  const H = rows.length * rh + 40
  const years: number[] = []
  for (let y = Math.ceil(t0); y <= Math.floor(t1); y++) years.push(y)
  const arrowId = `ah-${id}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="lviz" role="img" aria-label="Timeline of order shifts and risks named by equipment makers">
      <defs>
        <marker id={arrowId} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" className="vahead" />
        </marker>
      </defs>
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
        const label = (
          <text x={L - 10} y={y + 14} textAnchor="end" className="vl">
            {r.label}
          </text>
        )
        if (r.style === 'pull-forward') {
          const tx = Math.max(X(r.from), X(r.to)) + 10
          const years = `${Math.round(r.from)} → ${Math.round(r.to)}`
          const rest = fitMono(r.desc, W - 16 - tx - (years.length + 3) * 6.4)
          return (
            <g key={`${r.storyId}-${i}`}>
              {label}
              <line x1={X(r.from)} y1={y + 10} x2={X(r.to)} y2={y + 10} className="varrow" markerEnd={`url(#${arrowId})`} />
              <circle cx={X(r.from)} cy={y + 10} r={5} className="vghost" />
              <text x={tx} y={y + 14} className="vv">
                {years}
                {rest ? ` · ${rest}` : ''}
              </text>
            </g>
          )
        }
        if (r.style === 'mark') {
          return (
            <g key={`${r.storyId}-${i}`}>
              {label}
              <circle cx={X(r.from)} cy={y + 10} r={7} className={`vdot${r.desc && /risk|warn/i.test(r.desc) ? ' neg' : ''}`} />
              <text x={X(r.from) + 14} y={y + 14} className="vv">
                {fitMono(r.desc, W - 16 - X(r.from) - 14)}
              </text>
            </g>
          )
        }
        const barW = Math.max(4, X(r.to) - X(r.from))
        const inner = fitMono(r.desc, barW - 14)
        const after = inner ? '' : fitMono(r.desc, W - 16 - X(r.to) - 8)
        return (
          <g key={`${r.storyId}-${i}`}>
            {label}
            <rect x={X(r.from)} y={y + 3} width={barW} height={14} rx={3} className={`vb ${r.style === 'risk' ? 'neg' : 'add'}`}>
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
          </g>
        )
      })}
    </svg>
  )
}
