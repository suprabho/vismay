import Link from 'next/link'
import type { EditionEnergy } from '@vismay/content-source/dcEditionTypes'

/**
 * Chapter VI — where this epic meets the Energy Profile epic. Figures come
 * only from what the day's stories state: the hero power figure and its
 * composition, power disclosed per edition (last 7), three figure tiles,
 * the "open the stories" card and the Energy Profile links.
 */
export default function EnergyChapter({ energy }: { energy: EditionEnergy }) {
  const parts = energy.composition
  const total = parts.reduce((a, p) => a + p.gw, 0)
  const days = energy.perEdition
  const dayMax = Math.max(1, ...days.map((d) => d.gw)) * 1.1
  return (
    <div className="energy-grid">
      <div className="energy-viz">
        <div className="viz-head">
          <span className="eyebrow">{energy.hero ? energy.hero.label : 'Power committed in disclosed deals'}</span>
          {energy.hero ? (
            <span className="hero-num">
              {energy.hero.value}
              <small>{energy.hero.unit}</small>
            </span>
          ) : (
            <span className="eyebrow dim">no power figures disclosed in this window</span>
          )}
        </div>
        {parts.length > 0 && <Composition parts={parts} total={total} />}
        <div className="week">
          <div className="gcard-head">
            <span className="eyebrow">Power disclosed per edition · last {days.length}</span>
            <span className="eyebrow dim">GW · today highlighted</span>
          </div>
          <Weekly days={days} max={dayMax} />
        </div>
        {energy.figures.length > 0 && (
          <div className="energy-figs">
            {energy.figures.map((f, i) => (
              <div className="fig" key={i}>
                <div className="num">
                  {f.value}
                  {f.unit && <small>{f.unit}</small>}
                </div>
                <div className="lab">{f.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="energy-side">
        <button type="button" className="open-card" data-panel="energy">
          <span className="eyebrow">Today&rsquo;s coverage</span>
          <span className="big">
            {energy.storyCount} {energy.storyCount === 1 ? 'story' : 'stories'}
          </span>
          <span className="sub">Grid · Generation · Water · Policy · Storage · Outlook</span>
          <span className="go">Open the stories →</span>
        </button>
        <aside className="aside">
          <h3>Read alongside</h3>
          <p>Country-level series behind these stories live in the Energy Profile epic.</p>
          {(energy.links.length > 0 ? energy.links : [{ label: 'Energy Profile → all countries', href: '/energy-profile' }]).map((l) => (
            <span key={l.href}>
              <Link className="link" href={l.href}>
                {l.label} ↗
              </Link>
              <br />
            </span>
          ))}
        </aside>
      </div>
    </div>
  )
}

function Composition({ parts, total }: { parts: EditionEnergy['composition']; total: number }) {
  const W = 800
  const barY = 8
  const barH = 30
  const gap = 2
  const cls = ['c1', 'c2', 'c3', 'c1', 'c2']
  const widths = parts.map((p, i) => (p.gw / total) * W - (i < parts.length - 1 ? gap : 0))
  // Labels are ~7.2px per mono character. Each label takes the first row
  // unless it would overprint the label already there, then the second —
  // the last label is end-anchored, so it is checked against both rows.
  const CH = 7.2
  const rowEnd: [number, number] = [-Infinity, -Infinity]
  const segments = parts.map((p, i) => {
    const x = widths.slice(0, i).reduce((acc, w) => acc + w + gap, 0)
    const w = widths[i]
    const last = i === parts.length - 1
    const tx = last ? x + w - 2 : x + 2
    const labelW = Math.max(p.label.length, 6) * CH
    const start = last ? tx - labelW : tx
    const row = start >= rowEnd[0] + 8 ? 0 : start >= rowEnd[1] + 8 ? 1 : 0
    rowEnd[row] = Math.max(rowEnd[row], start + labelW)
    return { x, w, last, tx, ta: last ? 'end' : 'start', cls: cls[i % cls.length], p, row }
  })
  const twoRows = segments.some((s) => s.row === 1)
  return (
    <svg
      id="composition"
      viewBox={`0 0 ${W} ${twoRows ? 132 : 92}`}
      width="100%"
      role="img"
      aria-label={`${total.toFixed(1)} GW split: ${parts.map((p) => `${p.gw.toFixed(1)} GW ${p.label}`).join(', ')}`}
    >
      {segments.map((s, i) => (
        <g key={i}>
          <rect x={s.x} y={barY} width={Math.max(1, s.w)} height={barH} rx={3} className={s.cls}>
            <title>{`${s.p.label}: ${s.p.gw.toFixed(1)} GW`}</title>
          </rect>
          {(s.w > 40 || segments.length <= 3) && (
            <>
              <text x={s.tx} y={barY + barH + 22 + s.row * 40} textAnchor={s.ta as 'start' | 'end'} className="cl">
                {s.p.label}
              </text>
              <text x={s.tx} y={barY + barH + 42 + s.row * 40} textAnchor={s.ta as 'start' | 'end'} className="cv">
                {s.p.gw.toFixed(1)} GW
              </text>
            </>
          )}
        </g>
      ))}
    </svg>
  )
}

function Weekly({ days, max }: { days: EditionEnergy['perEdition']; max: number }) {
  const W = 800
  const H = 150
  const P = { l: 48, r: 8, t: 26, b: 26 }
  const n = Math.max(days.length, 1)
  const bw = (W - P.l - P.r) / n
  const grid = [1, 2, 3, 4].map((g) => Math.round((g * max) / 5 * 10) / 10).filter((g) => g > 0 && g < max)
  return (
    <svg id="weekly" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Power disclosed per daily edition over the last ${days.length} editions`}>
      <line x1={P.l} y1={H - P.b} x2={W - P.r} y2={H - P.b} className="wgrid" />
      {grid.map((g) => {
        const y = H - P.b - (g / max) * (H - P.t - P.b)
        return (
          <g key={g}>
            <line x1={P.l} y1={y} x2={W - P.r} y2={y} className="wgrid" />
            <text x={P.l - 8} y={y + 3} textAnchor="end" className="wg">
              {g} GW
            </text>
          </g>
        )
      })}
      {days.map((d, i) => {
        const x = P.l + i * bw + bw * 0.2
        const w = bw * 0.6
        const h = (d.gw / max) * (H - P.t - P.b)
        const y = H - P.b - h
        const today = i === days.length - 1
        return (
          <g key={d.date}>
            <rect x={x} y={d.gw ? y : H - P.b - 2} width={w} height={d.gw ? h : 2} rx={3} className={`wb${today ? ' today' : ''}`}>
              <title>{`${d.label}: ${d.gw.toFixed(1)} GW`}</title>
            </rect>
            <text x={x + w / 2} y={H - 8} textAnchor="middle" className={`wd${today ? ' today' : ''}`}>
              {d.label}
            </text>
            {(today || d.gw >= max * 0.4) && d.gw > 0 && (
              <text x={x + w / 2} y={y - 6} textAnchor="middle" className="wv">
                {d.gw.toFixed(1)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
