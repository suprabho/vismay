import type { MatrixViz } from '@vismay/content-source/dcEditionTypes'

/** Hyperscalers — company × action matrix (power deal, capacity, permit, pause, disclosure). */
export default function ActionMatrix({ viz }: { viz: MatrixViz }) {
  const { companies, actions, cells } = viz
  const W = 480
  const L = 100
  const cw = (W - L - 10) / actions.length
  const rh = 30
  const H = companies.length * rh + 34
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="lviz" role="img" aria-label="Matrix of hyperscalers and the kind of action each took today">
      {actions.map((a, j) => (
        <text key={a} x={L + j * cw + cw / 2} y={14} textAnchor="middle" className="vh">
          {a}
        </text>
      ))}
      {companies.map((c, i) => {
        const y = 26 + i * rh
        return (
          <g key={c}>
            <text x={L - 10} y={y + rh / 2 + 4} textAnchor="end" className="vl">
              {c}
            </text>
            <line x1={L} y1={y + rh} x2={W - 10} y2={y + rh} className="vgrid" />
            {actions.map((a, j) => {
              const cx = L + j * cw + cw / 2
              const cy = y + rh / 2
              const hit = cells.find((cell) => cell.company === c && cell.action === a)
              return hit ? (
                <circle key={a} cx={cx} cy={cy} r={8} className={`vdot ${a === 'Pause' ? 'neg' : a === 'Disclosure' ? 'en' : ''}`}>
                  <title>{`${c} — ${a}: ${hit.label}`}</title>
                </circle>
              ) : (
                <circle key={a} cx={cx} cy={cy} r={2} className="vempty" />
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}
