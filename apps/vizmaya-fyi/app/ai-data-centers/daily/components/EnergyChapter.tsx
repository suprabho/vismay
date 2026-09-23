import type { ReactNode } from 'react'
import Link from 'next/link'
import type { DcEditionStory, DcRegionKey, EditionChart, EditionEnergy } from '@vismay/content-source/dcEditionTypes'
import { DC_REGIONS, DC_THEMES } from '@vismay/content-source/dcEditionTypes'
import { MIN_VIZ_ROWS, figureKind, figureMagnitude, isCommittedPower, subjectKey, type DcFigureKind } from '@vismay/content-source/dcEditionAssembly'
import { MAX_RANGE_RATIO } from '@vismay/content-source/dcEditionCharts'
import { hm, storyMinutes } from './editionUtils'
import PlannedChart from './PlannedChart'

/**
 * Chapter VI — where this epic meets the Energy Profile epic.
 *
 * No fixed chart slots. Each viz below declares what it needs from the day's
 * stories; the engine keeps the ones this edition can actually fill, ranks
 * them by how much they carry, and prints what it held back and why. An
 * edition where nobody disclosed a power figure gets a different — but equally
 * real — chart rather than an empty axis with a caption apologising for it.
 *
 * Everything here is derived from the stories' own `facts.figures`, so a
 * number can only appear on a chart if a headline put it on the record.
 *
 * When the composer planned a chart for this chapter — a comparison it chose
 * from the same figures, grounded row by row and rendered at compose time —
 * that chart leads and the engine's own vizzes follow it.
 */

interface Props {
  energy: EditionEnergy
  /** The edition's stories; the energy-tagged ones are what this chapter reads. */
  stories: DcEditionStory[]
  ieaStories: DcEditionStory[]
  /** The composer's planned chart for this chapter, when it planned one. */
  chart?: EditionChart | null
}

interface EnergyFact {
  value: number
  unit: string
  /** Base-unit size from the classifier (v3), when it carried one. */
  base: number | null
  label: string
  /** v3 tags; null on rows classified before them. */
  subject: string | null
  scope: string | null
  status: string | null
  kind: DcFigureKind
  story: DcEditionStory
  /** Every outlet that put this figure on the record, in the order they landed. */
  sources: string[]
}

interface Viz {
  key: string
  title: string
  /** Printed in the note when this edition can't fill the chart. */
  reason: string
  /** 0 = can't be drawn from today's record; higher = carries more. */
  weight: number
  /** Shown as the big number when this viz leads the chapter. */
  hero?: { value: string; unit: string }
  /** Shown instead of the hero number on the secondary cards. */
  sub?: string
  render: (w: number) => ReactNode
}

const REGION_SHORT: Record<DcRegionKey, string> = {
  na: 'N. America',
  ea: 'E. Asia',
  eu: 'Europe',
  me: 'ME · India',
  other: 'Rest of world',
}

/** How much a figure says once it is off the committed-power bar. */
const RANK: Record<DcFigureKind, number> = { power: 5, energy: 4, share: 4, money: 3, horizon: 3, count: 2, term: 1 }

/** A figure's size on its dimension's scale (shared with the composer and the scraper). */
const magnitudeOf = (f: { value: number; unit: string; base?: number | null }): number | null => figureMagnitude(f)

const n1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const plural = (n: number, word: string) => `${n} ${n === 1 ? word : word === 'story' ? 'stories' : `${word}s`}`
const topicOf = (s: DcEditionStory) => (s.theme ? DC_THEMES[s.theme].name : 'Other')
/**
 * The axis label. Theme names are written as a pair ("Power & grid",
 * "Permitting & policy"); on a 430px card the row gutter fits about ten mono
 * characters, so the rail takes the first half and the full name stays in the
 * tooltip.
 */
const shortTopic = (topic: string) => topic.split(' & ')[0]
const asGw = (f: { value: number; unit: string }) => {
  const u = f.unit.trim().toLowerCase()
  return u === 'gw' ? f.value : u === 'mw' ? f.value / 1000 : null
}

function Svg({ w, h, label, children }: { w: number; h: number; label: string; children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" className="eviz-svg" role="img" aria-label={label}>
      {children}
    </svg>
  )
}

export default function EnergyChapter({ energy, stories, ieaStories, chart }: Props) {
  const energyStories = [...stories.filter((s) => s.energy), ...ieaStories]
  const planned = chart?.svg ? chart : null

  const facts: EnergyFact[] = []
  for (const story of energyStories) {
    for (const f of story.facts?.figures ?? []) {
      facts.push({
        value: f.value,
        unit: f.unit,
        base: f.base ?? null,
        label: f.label || story.title,
        subject: f.subject ?? null,
        scope: f.scope ?? null,
        status: f.status ?? null,
        kind: figureKind(f.unit),
        story,
        sources: [story.source ?? 'Unattributed'],
      })
    }
  }

  // Committed power — a PPA, a generation block, a tender that was let — is
  // the only thing that belongs on a bar of capacity. A 200 GW interconnection
  // queue is a real figure and stays in the record, but on the "other figures"
  // card, where it isn't read as capacity somebody bought.
  const committed = facts
    .filter((f) => f.kind === 'power' && isCommittedPower(f.story) && asGw(f) != null)
    .map((f) => ({ ...f, gw: asGw(f) as number }))
    .sort((a, b) => b.gw - a.gw)
  const committedTotal = committed.reduce((a, f) => a + f.gw, 0)
  // One row per fact, not per outlet. Two wires reporting the same 640 MW —
  // "AI data center capacity" and "AI data centre capacity" — are one figure on
  // the record, and printing it twice reads as two separate disclosures.
  const others = dedupe(facts.filter((f) => !committed.some((c) => c.story.id === f.story.id && c.label === f.label && c.value === f.value)))
  const silent = energyStories.filter(
    (s) => (s.theme === 'power' || s.theme === 'capacity') && !(s.facts?.figures ?? []).some((f) => figureKind(f.unit) === 'power'),
  )

  // Editions composed before this chapter existed stored 0 where they meant
  // "nobody disclosed anything"; the composer now writes null. Both are gaps —
  // a disclosure is never 0 GW — and treating the 0s as real readings made the
  // chart claim full disclosure while dividing every bar height by a zero max,
  // which drew nothing at all.
  const series = energy.perEdition.map((s) => ({ ...s, gw: s.gw ? s.gw : null }))
  const told = series.filter((s) => s.gw != null)
  const topics = [...new Set(energyStories.map(topicOf))]
  const placed = energyStories.filter((s) => s.region != null)
  const regions = [...new Set(placed.map((s) => s.region as DcRegionKey))]

  const vizzes: Viz[] = [
    ...(planned
      ? [
          {
            key: 'planned',
            title: planned.title,
            reason: '',
            // Leads whenever it exists: it is the one comparison the composer
            // chose from the record, not a template the tags happened to fill.
            weight: 1000,
            sub: `${planned.spec.rows.length} rows · ${planned.sources.length} source${planned.sources.length === 1 ? '' : 's'}`,
            render: () => <PlannedChart chart={planned} />,
          } satisfies Viz,
        ]
      : []),
    {
      key: 'ledger',
      title: 'Power committed in deals that state a figure',
      reason: committed.length
        ? `only ${committed.length} deal${committed.length === 1 ? '' : 's'} state${committed.length === 1 ? 's' : ''} committed capacity — a bar needs ${MIN_VIZ_ROWS}`
        : 'no deal in this edition states the capacity it commits',
      weight: committed.length >= MIN_VIZ_ROWS ? 140 + committed.length * 4 : 0,
      hero: { value: n1(committedTotal), unit: 'GW' },
      render: (W) => {
        const L = Math.round(W * 0.33)
        const rh = 40
        const BW = W - L - Math.round(W * 0.12)
        const max = committed[0].gw
        const H = committed.length * rh + 36
        const cut = W > 600 ? 34 : 20
        const footY = committed.length * rh + 8
        return (
          <Svg w={W} h={H} label="Power committed per disclosed deal">
            {committed.map((f, i) => {
              const y = i * rh
              const w = Math.max(4, (f.gw / max) * BW)
              return (
                <g key={`${f.story.id}-${i}`}>
                  <text x={0} y={y + 16} className="elab">
                    {clip(f.label, cut)}
                  </text>
                  <text x={0} y={y + 31} className="esrc">
                    {f.story.source ?? 'Source'} · {hm(f.story.publishedAt)}
                  </text>
                  <rect x={L} y={y + 8} width={w} height={16} rx={3} className={`ebar c${(i % 3) + 1}`}>
                    <title>{`${f.label}: ${n1(f.gw)} GW`}</title>
                  </rect>
                  <text x={L + w + 10} y={y + 21} className="eval">
                    {n1(f.gw)} GW
                  </text>
                </g>
              )
            })}
            <line x1={0} y1={footY} x2={W} y2={footY} className="egrid" />
            <text x={0} y={footY + 20} className="esrc">
              {silent.length
                ? `${silent.length} further grid or generation ${silent.length === 1 ? 'story states' : 'stories state'} no capacity figure — left off this bar`
                : 'Every power story today carries a figure'}
            </text>
          </Svg>
        )
      },
    },
    {
      key: 'history',
      title: `Power disclosed per edition · last ${series.length}`,
      reason: `only ${told.length} of the last ${series.length} editions put a number on it`,
      weight: told.length >= 3 ? 110 : 0,
      sub: `${told.length} of ${series.length} editions disclosed`,
      render: (W) => {
        const H = 170
        const P = { l: W > 600 ? 54 : 44, r: 10, t: 26, b: 34 }
        const max = Math.max(...told.map((s) => s.gw as number)) * 1.18
        const bw = (W - P.l - P.r) / series.length
        const y0 = H - P.b
        const Y = (v: number) => y0 - (v / max) * (H - P.t - P.b)
        const step = max > 4 ? 2 : max > 2 ? 1 : 0.5
        const grid: number[] = []
        for (let g = step; g < max; g += step) grid.push(Math.round(g * 100) / 100)
        return (
          <Svg w={W} h={H} label="Power disclosed per edition; editions that disclosed nothing are drawn as gaps, not zeroes">
            <line x1={P.l} y1={y0} x2={W - P.r} y2={y0} className="egrid" />
            {grid.map((g) => (
              <g key={g}>
                <line x1={P.l} y1={Y(g)} x2={W - P.r} y2={Y(g)} className="egrid" />
                <text x={P.l - 8} y={Y(g) + 3} textAnchor="end" className="eg">
                  {n1(g)} GW
                </text>
              </g>
            ))}
            {series.map((s, i) => {
              const x = P.l + i * bw + bw * 0.22
              const w = bw * 0.56
              const now = i === series.length - 1
              return (
                <g key={s.date}>
                  {s.gw == null ? (
                    <>
                      <rect x={x} y={y0 - 28} width={w} height={28} rx={3} className="eghost">
                        <title>{`${s.label}: no figure disclosed`}</title>
                      </rect>
                      <text x={x + w / 2} y={y0 - 11} textAnchor="middle" className="eg">
                        none
                      </text>
                    </>
                  ) : (
                    <>
                      <rect x={x} y={Y(s.gw)} width={w} height={y0 - Y(s.gw)} rx={3} className={`ebar ${now ? 'now' : 'past'}`}>
                        <title>{`${s.label}: ${n1(s.gw)} GW`}</title>
                      </rect>
                      <text x={x + w / 2} y={Y(s.gw) - 6} textAnchor="middle" className="eval">
                        {n1(s.gw)}
                      </text>
                    </>
                  )}
                  <text x={x + w / 2} y={H - 12} textAnchor="middle" className={`ed${now ? ' now' : ''}`}>
                    {s.label}
                  </text>
                </g>
              )
            })}
          </Svg>
        )
      },
    },
    {
      key: 'figures',
      title: 'Other figures on the record today',
      reason: others.length ? `only ${others.length} other figure${others.length === 1 ? '' : 's'} on the record — the card needs ${MIN_VIZ_ROWS}` : 'no story stated a figure of any kind',
      weight: others.length >= MIN_VIZ_ROWS ? 90 + others.length * 3 : 0,
      hero: others.length ? heroOf(others) : undefined,
      render: () => {
        const rows = [...others].sort(byTelling).slice(0, 5)
        // A rail compares a figure with its honest peers only: same dimension,
        // and — where the classifier tagged them — the same status and scope,
        // within one readable range. A 20 GW market target and a 640 MW site
        // are both power, but the rail that drew one as 3% of the other said
        // nothing true; untagged figures get no rail rather than a wrong one.
        const peers = (f: EnergyFact) => {
          if (magnitudeOf(f) == null || !f.status || !f.scope) return []
          const p = rows.filter((r) => r.kind === f.kind && r.status === f.status && r.scope === f.scope && magnitudeOf(r) != null)
          const sizes = p.map((r) => magnitudeOf(r) as number).filter((v) => v > 0)
          return sizes.length && Math.max(...sizes) / Math.min(...sizes) <= MAX_RANGE_RATIO ? p : []
        }
        return (
          <div className="efigs">
            {rows.map((f, i) => {
              const p = peers(f)
              const max = Math.max(...p.map((r) => magnitudeOf(r) as number))
              const mine = magnitudeOf(f)
              return (
                <div className="efig" key={`${f.story.id}-${i}`}>
                  <span className="num">
                    {n1(f.value)}
                    {f.unit && <small>{f.unit}</small>}
                  </span>
                  <span className="lab">
                    {clip(f.label, 72)}
                    <span className="src">{f.sources.join(' · ')}</span>
                  </span>
                  {p.length > 1 && mine != null && max > 0 && (
                    <span className="rail">
                      <i style={{ width: `${Math.max(2, (mine / max) * 100).toFixed(1)}%` }} />
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )
      },
    },
    {
      key: 'matrix',
      title: 'What today covered · topic by region',
      reason: placed.length ? 'today’s energy stories fall in one topic or one region — a grid needs two of each' : 'no energy story in this edition carries a region',
      weight: placed.length >= MIN_VIZ_ROWS && topics.length >= 2 && regions.length >= 2 ? 60 + topics.length * 3 : 0,
      sub: placed.length === energyStories.length
        ? `${plural(placed.length, 'story')} · ${plural(topics.length, 'topic')}`
        : `${placed.length} of ${energyStories.length} stories carry a region`,
      render: (W) => {
        const at = (t: string, r: DcRegionKey) => placed.filter((s) => topicOf(s) === t && s.region === r)
        const L = Math.max(96, Math.round(W * 0.22))
        const rh = 34
        const H = topics.length * rh + 44
        const cw = (W - L - 10) / Math.max(regions.length, 1)
        const max = Math.max(1, ...topics.map((t) => Math.max(...regions.map((r) => at(t, r).length))))
        return (
          <Svg w={W} h={H} label="Energy topics covered, by region">
            {regions.map((r, j) => (
              <text key={r} x={L + j * cw + cw / 2} y={14} textAnchor="middle" className="eh">
                {cw > 150 ? DC_REGIONS[r] : REGION_SHORT[r]}
              </text>
            ))}
            {topics.map((t, i) => {
              const y = 28 + i * rh
              return (
                <g key={t}>
                  <text x={L - 12} y={y + rh / 2 + 4} textAnchor="end" className="elab">
                    <title>{t}</title>
                    {clip(shortTopic(t), Math.max(6, Math.floor((L - 16) / 7.2)))}
                  </text>
                  <line x1={L} y1={y + rh} x2={W - 10} y2={y + rh} className="egrid" />
                  {regions.map((r, j) => {
                    const hit = at(t, r)
                    const cx = L + j * cw + cw / 2
                    const cy = y + rh / 2
                    if (!hit.length) return <circle key={r} cx={cx} cy={cy} r={2} className="eempty" />
                    return (
                      <g key={r}>
                        <circle cx={cx} cy={cy} r={7 + (hit.length / max) * 7} className="ecell">
                          <title>{`${t} · ${DC_REGIONS[r]} — ${hit.map((s) => s.title).join(' / ')}`}</title>
                        </circle>
                        <text x={cx} y={cy + 3.5} textAnchor="middle" className="ecn">
                          {hit.length}
                        </text>
                      </g>
                    )
                  })}
                </g>
              )
            })}
          </Svg>
        )
      },
    },
    {
      key: 'clock',
      title: 'When the energy stories landed',
      reason: energyStories.length ? `only ${plural(energyStories.length, 'story')} — a clock needs ${MIN_VIZ_ROWS}` : 'today’s stories carry no timestamps',
      weight: energyStories.length >= MIN_VIZ_ROWS ? 50 : 0,
      render: (W) => {
        const P = { l: 26, r: 26 }
        const X = (s: DcEditionStory) => P.l + (storyMinutes(s) / 1440) * (W - P.l - P.r)
        const placed: { lane: number; x: number; s: DcEditionStory }[] = []
        for (const s of [...energyStories].sort((a, b) => storyMinutes(a) - storyMinutes(b))) {
          const x = X(s)
          let lane = 0
          while (placed.some((p) => p.lane === lane && Math.abs(p.x - x) < 18)) lane++
          placed.push({ lane, x, s })
        }
        const top = Math.max(0, ...placed.map((p) => p.lane))
        const H = top * 18 + 64
        const base = H - 30
        return (
          <Svg w={W} h={H} label="Clock of when today’s energy stories were published">
            <line x1={P.l} y1={base} x2={W - P.r} y2={base} className="egrid" />
            {[0, 6, 12, 18, 24].map((h) => {
              const px = P.l + (h / 24) * (W - P.l - P.r)
              return (
                <g key={h}>
                  <line x1={px} y1={base} x2={px} y2={base + 5} className="egrid" />
                  <text x={px} y={base + 19} textAnchor={h === 0 ? 'start' : h === 24 ? 'end' : 'middle'} className="eg">
                    {`${String(h).padStart(2, '0')}:00`}
                  </text>
                </g>
              )
            })}
            {placed.map(({ lane, x, s }) => {
              const cy = base - 14 - lane * 18
              return (
                <g key={s.id}>
                  <line x1={x} y1={base} x2={x} y2={cy} className="egrid" />
                  <circle cx={x} cy={cy} r={6} className={`edot${(s.mood ?? 0) < 0 ? ' neg' : (s.mood ?? 0) > 0 ? '' : ' flat'}`}>
                    <title>{`${hm(s.publishedAt)} · ${topicOf(s)} — ${s.title}`}</title>
                  </circle>
                </g>
              )
            })}
          </Svg>
        )
      },
    },
    {
      key: 'balance',
      title: 'Pressure and relief by topic',
      reason: 'every energy story today leans the same way',
      weight: energyStories.length >= MIN_VIZ_ROWS && energyStories.some((s) => (s.mood ?? 0) < 0) && energyStories.some((s) => (s.mood ?? 0) > 0) ? 45 : 0,
      render: (W) => {
        const rows = topics
          .map((t) => ({
            t,
            up: energyStories.filter((s) => topicOf(s) === t && (s.mood ?? 0) > 0).length,
            dn: energyStories.filter((s) => topicOf(s) === t && (s.mood ?? 0) < 0).length,
          }))
          .filter((r) => r.up || r.dn)
          .sort((a, b) => b.up + b.dn - (a.up + a.dn))
        const C = W / 2
        const off = W > 600 ? 70 : 52
        const rh = 30
        const H = rows.length * rh + 40
        const max = Math.max(1, ...rows.map((r) => Math.max(r.up, r.dn)))
        const u = (C - off - 48) / max
        return (
          <Svg w={W} h={H} label="Energy stories that add grid pressure versus stories that ease it, by topic">
            <text x={C - 14} y={12} textAnchor="end" className="eh">
              Pressure
            </text>
            <text x={C + 14} y={12} textAnchor="start" className="eh">
              Relief
            </text>
            {rows.map((r, i) => {
              const y = 24 + i * rh
              return (
                <g key={r.t}>
                  <text x={C} y={y + rh / 2 + 4} textAnchor="middle" className="elab mid">
                    <title>{r.t}</title>
                    {clip(shortTopic(r.t), W > 600 ? 16 : 11)}
                  </text>
                  {r.dn > 0 && (
                    <>
                      <rect x={C - off - r.dn * u} y={y + 7} width={r.dn * u} height={16} rx={3} className="ebar neg">
                        <title>{`${r.t}: ${plural(r.dn, 'story')} adding pressure`}</title>
                      </rect>
                      <text x={C - off - 6 - r.dn * u} y={y + 20} textAnchor="end" className="eval">
                        {r.dn}
                      </text>
                    </>
                  )}
                  {r.up > 0 && (
                    <>
                      <rect x={C + off} y={y + 7} width={r.up * u} height={16} rx={3} className="ebar pos">
                        <title>{`${r.t}: ${plural(r.up, 'story')} easing it`}</title>
                      </rect>
                      <text x={C + off + 6 + r.up * u} y={y + 20} className="eval">
                        {r.up}
                      </text>
                    </>
                  )}
                </g>
              )
            })}
            <line x1={C} y1={18} x2={C} y2={H - 14} className="egrid" />
          </Svg>
        )
      },
    },
  ]

  // Two outlets stating the same number is one figure on the record, which is
  // what the count should say — the card shows one row for it.
  const distinctFigures = dedupe(facts).length
  const live = vizzes.filter((v) => v.weight > 0).sort((a, b) => b.weight - a.weight)
  const held = vizzes.filter((v) => v.weight <= 0)
  // Three of the six chart the stories rather than the figures — where they
  // landed in the day, how they split by region, which way they lean. They are
  // the floor this section never falls through, not filler to reach five
  // cards: mounting all of them alongside the figures gave four charts of the
  // same 21 story tags and buried the one card carrying numbers. So they come
  // up only when the figures can't carry the chapter, one at a time.
  const carriesFigures = (v: Viz) => v.key === 'planned' || v.key === 'ledger' || v.key === 'history' || v.key === 'figures'
  const figureCharts = live.filter(carriesFigures)
  const coverage = live.filter((v) => !carriesFigures(v))
  const shown = [...figureCharts, ...coverage.slice(0, figureCharts.length >= 2 ? 0 : 1)]
  const spare = live.filter((v) => !shown.includes(v))
  const rest = shown.slice(1)
  const pairs: Viz[][] = []
  for (let i = 0; i < rest.length; i += 2) pairs.push(rest.slice(i, i + 2))

  return (
    <div className="energy-grid">
      <div className="energy-viz">
        {shown.length > 0 ? (
          <>
            <Card viz={shown[0]} hero w={800} />
            {pairs.map((pair, i) =>
              pair.length > 1 ? (
                <div className="eviz-row" key={pair[0].key}>
                  {pair.map((v) => (
                    <Card viz={v} key={v.key} w={430} />
                  ))}
                </div>
              ) : (
                <Card viz={pair[0]} key={pair[0].key} w={800} />
              ),
            )}
            <p className="eviz-note">
              {plural(shown.length, 'chart')} built from {plural(distinctFigures, 'stated figure')} across {plural(energyStories.length, 'story')}
              {planned ? ', the first planned by the composer from the record' : ''}.
              {spare.length > 0 && ` Also had the data for ${spare.map((v) => v.title.toLowerCase()).join(', ')}.`}
              {held.length > 0 && ` Held back: ${held.map((v) => `${v.title.toLowerCase()} (${v.reason})`).join('; ')}.`}
            </p>
          </>
        ) : (
          <p className="eviz-note">No energy stories in this edition — nothing to chart.</p>
        )}
      </div>
      <div className="energy-side">
        <button type="button" className="open-card" data-panel="energy">
          <span className="eyebrow">Today&rsquo;s coverage</span>
          <span className="big">{plural(energy.storyCount, 'story')}</span>
          <span className="sub">{topics.join(' · ') || 'No energy stories today'}</span>
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

/** Most telling first: the highest-ranked kind, then the largest on a shared scale. */
function byTelling(a: EnergyFact, b: EnergyFact): number {
  if (RANK[b.kind] !== RANK[a.kind]) return RANK[b.kind] - RANK[a.kind]
  const ma = magnitudeOf(a)
  const mb = magnitudeOf(b)
  if (ma != null && mb != null) return mb - ma
  return b.value - a.value
}

/**
 * Collapse the same figure reported by several outlets into one row, keeping
 * each outlet's name. Where the classifier tagged a subject, the same subject
 * measured in the same dimension is one figure — "BDx West Java" at 640 MW
 * from two wires, or the same site quoted as 640 MW and 0.64 GW — and the
 * row keeps whichever statement ranks highest. Untagged rows fall back to
 * the older test: same dimension, same size, same label once spelling is
 * normalised ("data center" / "data centre").
 */
function dedupe(facts: EnergyFact[]): EnergyFact[] {
  const out: EnergyFact[] = []
  const seen = new Map<string, EnergyFact>()
  for (const f of [...facts].sort(byTelling)) {
    const size = magnitudeOf(f)
    const key = f.subject
      ? `${f.kind}|${subjectKey(f.subject)}|${f.status ?? ''}`
      : `${f.kind}|${size ?? `${f.value}${f.unit}`}|${subjectKey(f.label)}`
    const hit = seen.get(key)
    if (hit) {
      for (const src of f.sources) if (!hit.sources.includes(src)) hit.sources.push(src)
      continue
    }
    const copy = { ...f, sources: [...f.sources] }
    seen.set(key, copy)
    out.push(copy)
  }
  return out
}

/** The figure that leads the "other figures" card. */
function heroOf(others: EnergyFact[]): { value: string; unit: string } {
  const top = [...others].sort(byTelling)[0]
  return { value: n1(top.value), unit: top.unit || '' }
}

function Card({ viz, hero = false, w }: { viz: Viz; hero?: boolean; w: number }) {
  return (
    <section className={`eviz${hero ? ' hero' : ''}`}>
      <div className="eviz-head">
        <span className="eyebrow">{viz.title}</span>
        {hero && viz.hero ? (
          <span className="hero-num">
            {viz.hero.value}
            {viz.hero.unit && <small>{viz.hero.unit}</small>}
          </span>
        ) : viz.sub ? (
          <span className="eyebrow dim">{viz.sub}</span>
        ) : null}
      </div>
      {viz.render(w)}
    </section>
  )
}
