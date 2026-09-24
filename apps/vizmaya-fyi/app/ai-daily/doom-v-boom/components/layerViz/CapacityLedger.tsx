import type { CapacityViz } from '@vismay/content-source/dcEditionTypes'

/** Data centers — MW added per site vs items paused / frozen (hatched when no MW given). */
export default function CapacityLedger({ viz, id }: { viz: CapacityViz; id: string }) {
  const rows = viz.rows
  const W = 480
  const rh = 24
  const L = 215
  const H = rows.length * rh + 44
  const max = Math.max(1, ...rows.map((r) => r.mw ?? 0), 420)
  const sc = (v: number) => (v / max) * (W - L - 90)
  const y0 = rows.length * rh + 8
  const hatchId = `hatch-${id}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="lviz" role="img" aria-label="Capacity added versus paused or frozen today">
      <defs>
        <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" className="hatch" />
        </pattern>
      </defs>
      {rows.map((r, i) => {
        const y = i * rh
        return (
          <g key={`${r.storyId}-${i}`}>
            <text x={L - 10} y={y + 15} textAnchor="end" className="vl">
              {r.label}
            </text>
            {r.mw != null ? (
              <>
                <rect x={L} y={y + 5} width={Math.max(2, sc(r.mw))} height={12} rx={2} className="vb add">
                  <title>{`${r.label}: +${r.mw} MW`}</title>
                </rect>
                <text x={L + sc(r.mw) + 8} y={y + 15} className="vv">
                  +{r.mw.toLocaleString('en-US')} MW
                </text>
              </>
            ) : (
              <>
                <rect x={L} y={y + 5} width={sc(420)} height={12} rx={2} className={`vb ${r.action}`} />
                <rect x={L} y={y + 5} width={sc(420)} height={12} rx={2} fill={`url(#${hatchId})`} />
                <text x={L + sc(420) + 8} y={y + 15} className="vv dim">
                  {r.action === 'add' ? 'MW undisclosed' : `${r.action === 'pause' ? 'paused' : 'frozen'} · MW undisclosed`}
                </text>
              </>
            )}
          </g>
        )
      })}
      <line x1={L} y1={y0} x2={W - 16} y2={y0} className="vaxis" />
      <text x={L} y={y0 + 16} className="vk">
        Added, as stated: <tspan className="hi">{viz.addedMw.toLocaleString('en-US')} MW</tspan>
      </text>
      <text x={L} y={y0 + 30} className="vk">
        Paused or frozen: {viz.pausedCount}
        {viz.pausedCount > 0 ? ' (MW undisclosed)' : ''}
      </text>
    </svg>
  )
}
