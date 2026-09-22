import type { DcPaper, EditionResearch } from '@vismay/content-source/dcEditionTypes'
import { DC_COMPUTE_BUCKETS, DC_PAPER_AREAS, DC_PAPER_AREA_KEYS } from '@vismay/content-source/dcEditionTypes'
import { paperGainNorm, paperGainText, shortTitle } from '@vismay/content-source/dcEditionAssembly'

/**
 * Chapter V — the day in AI research on its own terms: which fields moved
 * (today vs the 30-edition average), how open it was, results at scale, and
 * result-led paper cards. Every paper opens the panel; every card links to arXiv.
 */
export default function ResearchChapter({ research, papers }: { research: EditionResearch; papers: DcPaper[] }) {
  const areaCount = (k: string) => papers.filter((p) => p.area === k).length
  const max = Math.max(4, ...DC_PAPER_AREA_KEYS.map((k) => Math.max(areaCount(k), research.fieldBaseline[k] ?? 0)))
  const w = papers.filter((p) => p.weightsReleased).length
  const c = papers.filter((p) => p.codeReleased).length
  const labs = papers.filter((p) => p.kind === 'lab').length
  const acad = papers.filter((p) => p.kind === 'academic').length
  const mix = papers.length - labs - acad
  const n = papers.length

  return (
    <>
      <div className="rhead">
        <div className="rheadline">{research.headline || 'No research headline for this window'}</div>
        {research.sub && <p className="rsub">{research.sub}</p>}
      </div>
      {research.notice && n === 0 && <p className="notice">{research.notice}</p>}
      <div className="rgrid">
        <div className="gcard">
          <div className="gcard-head">
            <span className="eyebrow">Which fields moved</span>
            <span className="eyebrow dim">papers today ● vs 30-edition average ○</span>
          </div>
          <div className="fieldplot" id="fieldplot">
            {DC_PAPER_AREA_KEYS.map((k) => {
              const today = areaCount(k)
              const base = research.fieldBaseline[k] ?? 0
              return (
                <button type="button" className="frow" data-panel={`area:${k}`} key={k}>
                  <span className="fname">{DC_PAPER_AREAS[k]}</span>
                  <span className="ftrack">
                    <i className="fbase" style={{ left: `${(base / max) * 100}%` }} title={`30-edition average ${base}`} />
                    <i className={`fnow${today > base ? ' up' : today < base ? ' down' : ''}`} style={{ left: `${(today / max) * 100}%` }} title={`today ${today}`} />
                    <i className="fline" style={{ left: `${(Math.min(today, base) / max) * 100}%`, width: `${(Math.abs(today - base) / max) * 100}%` }} />
                  </span>
                  <span className="fn mono">
                    {today}
                    <small> vs {base}</small>
                  </span>
                </button>
              )
            })}
            <div className="faxis mono">
              {[0, 1, 2, 3].map((v) => (
                <span key={v}>{Math.round((v * max) / 4)}</span>
              ))}
              <span>{max} papers</span>
            </div>
          </div>
          <div className="gcard-head" style={{ marginTop: 14 }}>
            <span className="eyebrow">How open was it</span>
          </div>
          <div className="openness" id="openness">
            <OpenRow label="Weights released" parts={[[w, 'on', 'Released'], [n - w, 'off', 'Not released']]} text={`${w} / ${n}`} />
            <OpenRow label="Code released" parts={[[c, 'on', 'Released'], [n - c, 'off', 'Not released']]} text={`${c} / ${n}`} />
            <OpenRow
              label="Who published"
              parts={[[labs, 'lab', 'Industry lab'], [mix, 'mix', 'Academic + industry'], [acad, 'acad', 'Academic']]}
              text={`${labs} lab · ${mix} mixed · ${acad} academic`}
            />
          </div>
        </div>
        <div className="gcard">
          <div className="gcard-head">
            <span className="eyebrow">Results at scale</span>
            <span className="eyebrow dim">
              <i className="lg on" />
              weights or code released <i className="lg off" />
              closed
            </span>
          </div>
          <Quadrant papers={papers} />
        </div>
      </div>
      {n > 0 && (
        <>
          <div className="eyebrow dim" style={{ margin: '22px 0 10px' }}>
            The papers · headline result, scale, what was released
          </div>
          <div className="paper-grid" id="paper-grid">
            {papers.map((p, i) => (
              <button type="button" className="pcard" data-panel={`paper:${p.arxivId}`} key={p.arxivId}>
                <span className="pmeta">
                  <span className="cat">
                    <b className="pn">{i + 1}</b>
                    {p.area ? DC_PAPER_AREAS[p.area] : 'Uncategorised'}
                  </span>
                  <span className="mono">
                    {p.category ?? 'arXiv'} · {p.publishedAt.slice(0, 10)}
                  </span>
                </span>
                <span className="pt">{p.title}</span>
                <span className="paff">{p.affiliations || p.authors || ''}</span>
                <span className="pres">
                  <b>{paperGainText(p)}</b>
                  <small>{p.bench ?? 'no benchmark stated'}</small>
                </span>
                <span className="pflags">
                  <i className={p.weightsReleased ? 'on' : ''} title="Weights released">
                    W
                  </i>
                  <i className={p.codeReleased ? 'on' : ''} title="Code released">
                    C
                  </i>
                  <span className="mono">{p.scale ?? '—'}</span>
                </span>
                <span className="go">Why it matters →</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function OpenRow({ label, parts, text }: { label: string; parts: [number, string, string][]; text: string }) {
  return (
    <div className="orow">
      <span className="olab">{label}</span>
      <span className="obar">
        {parts.map(([count, cls, title]) => (count > 0 ? <i key={cls} className={cls} style={{ flex: count }} title={`${title}: ${count}`} /> : null))}
      </span>
      <span className="mono">{text}</span>
    </div>
  )
}

function Quadrant({ papers }: { papers: DcPaper[] }) {
  const W = 900
  const H = 400
  const P = { l: 64, r: 30, t: 30, b: 54 }
  const YM = 25
  const X = (c: number) => P.l + ((c + 0.5) / DC_COMPUTE_BUCKETS.length) * (W - P.l - P.r)
  const Y = (v: number) => H - P.b - (v / YM) * (H - P.t - P.b)
  // Alternate label sides so neighbouring points don't overwrite each other.
  const placement = (i: number): ['start' | 'end', number] => {
    const table: ['start' | 'end', number][] = [['end', 0], ['start', 16], ['start', -16], ['end', 16], ['start', 0], ['start', 0], ['start', 0], ['start', 16]]
    return table[i % table.length]
  }
  return (
    <>
      <svg id="quadrant" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Papers placed by reported gain over baseline and the estimated compute of the headline experiment">
        <rect x={P.l} y={P.t} width={W - P.l - P.r} height={H - P.t - P.b} className="qbg" />
        {DC_COMPUTE_BUCKETS.map((c, i) => (
          <g key={c}>
            <line x1={X(i)} y1={P.t} x2={X(i)} y2={H - P.b} className="qmid" />
            <text x={X(i)} y={H - P.b + 20} textAnchor="middle" className="qax">
              {c.replace(' FLOP', '')}
            </text>
          </g>
        ))}
        {[0, 5, 10, 15, 20, 25].map((v) => (
          <g key={v}>
            <text x={P.l - 8} y={Y(v) + 4} textAnchor="end" className="qc">
              {v}
            </text>
            <line x1={P.l} y1={Y(v)} x2={W - P.r} y2={Y(v)} className="qgrid" />
          </g>
        ))}
        <text x={(P.l + W - P.r) / 2} y={H - P.b + 40} textAnchor="middle" className="qax">
          Estimated compute behind the headline experiment (FLOP)
        </text>
        <text transform={`translate(16 ${(P.t + H - P.b) / 2}) rotate(-90)`} textAnchor="middle" className="qax">
          Gain over baseline (normalised)
        </text>
        {papers.map((p, i) => {
          const cx = X(p.computeBucket ?? 0)
          const cy = Y(Math.min(YM, paperGainNorm(p)))
          const open = p.weightsReleased || p.codeReleased
          const [side, dy] = placement(i)
          const lx = side === 'end' ? cx - 22 : cx + 22
          return (
            <g className="qp" data-panel={`paper:${p.arxivId}`} role="button" tabIndex={0} key={p.arxivId}>
              <circle cx={cx} cy={cy} r={18} className={`qhalo${open ? '' : ' closed'}`} />
              <circle cx={cx} cy={cy} r={8} className={`qdot${open ? '' : ' closed'}`} />
              <text x={cx} y={cy + 3.5} textAnchor="middle" className="qn">
                {i + 1}
              </text>
              <text x={lx} y={cy + 4 + dy} textAnchor={side} className="qt">
                {shortTitle(p.title, 28)} <tspan className="qc">· {paperGainText(p)}{p.bench ? ` ${shortTitle(p.bench, 18)}` : ''}</tspan>
              </text>
              <title>{p.title}</title>
            </g>
          )
        })}
        {papers.length === 0 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" className="qlab">
            No papers in this edition
          </text>
        )}
      </svg>
      <div className="quadrant-note">Compute buckets are estimates from the stated scale; gains are normalised across benchmark points, multipliers and percentages.</div>
    </>
  )
}
