import type { DcPaper, EditionChart, EditionResearch } from '@vismay/content-source/dcEditionTypes'
import { DC_PAPER_AREAS, DC_PAPER_AREA_KEYS } from '@vismay/content-source/dcEditionTypes'
import { paperGainText } from '@vismay/content-source/dcEditionAssembly'
import QuadrantPlot from './QuadrantPlot'
import PlannedChart from './PlannedChart'

/**
 * Chapter V — the day in AI research on its own terms: which fields moved
 * (today vs the 30-edition average), how open it was, results at scale, and
 * result-led paper cards. Every paper opens the panel; every card links to arXiv.
 */
export default function ResearchChapter({ research, papers, chart }: { research: EditionResearch; papers: DcPaper[]; chart?: EditionChart | null }) {
  // The composer's chart for the chapter leads in the results card; the
  // scatter stays for editions composed before charts existed.
  const planned = chart?.svg ? chart : null
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
      {/* No papers means no field bars of zeros and no empty scatter: the notice is the chapter. */}
      {n > 0 && (
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
          {planned ? (
            <>
              <div className="gcard-head">
                <span className="eyebrow">{planned.title}</span>
              </div>
              <PlannedChart chart={planned} sources={false} />
            </>
          ) : (
            <QuadrantPlot papers={papers} />
          )}
        </div>
      </div>
      )}
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
