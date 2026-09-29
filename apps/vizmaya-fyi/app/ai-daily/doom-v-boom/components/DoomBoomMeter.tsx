import type { DcEditionStory, EditionMoodCounts, EditionMoodPoint } from '@vismay/content-source/dcEditionTypes'
import { formatSigned, moodTone, moodWord } from '@vismay/content-source/dcEditionTypes'
import { eventDrivers, moodDrivers } from '@vismay/content-source/dcEditionAssembly'
import { hm } from './editionUtils'

interface Props {
  score: number | null
  counts: EditionMoodCounts
  series: EditionMoodPoint[]
  stories: DcEditionStory[]
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

interface Driver {
  key: number
  url: string
  title: string
  source: string | null
  publishedAt: string
  /** Other outlets' reports of the same event. */
  also: string[]
}

/**
 * Meter geometry per breakpoint. The SVG scales with its box, so one wide
 * viewBox shrinks its labels to ~4px on a phone; the narrow layout keeps
 * text legible there (CSS shows one or the other). `fs` mirrors the CSS
 * font sizes, used to keep centred labels inside the track.
 */
const GEOM = {
  wide: { W: 1000, H: 120, L: 60, R: 60, ty: 52, now: 26, lab: 34, g30: 48, g7: 62, fs: { ghost: 10.5, now: 12 } },
  narrow: { W: 360, H: 140, L: 22, R: 22, ty: 58, now: 30, lab: 32, g30: 50, g7: 66, fs: { ghost: 11, now: 14 } },
} as const

function Meter({ size, score, d7, d30 }: { size: keyof typeof GEOM; score: number | null; d7: number | null; d30: number | null }) {
  const { W, H, L, R, ty, now, lab, g30, g7, fs } = GEOM[size]
  const cx = (v: number) => L + ((v + 1) / 2) * (W - L - R)
  // Centre a label on x, nudged so its (monospace) text stays within the viewBox.
  const tx = (x: number, text: string, px: number) => {
    const half = (text.length * px * 0.6) / 2
    return Math.min(Math.max(x, half), W - half)
  }
  const grad = `dbgrad-${size}`
  const l30 = d30 != null ? `30-day ${formatSigned(d30)}` : ''
  const l7 = d7 != null ? `7-day ${formatSigned(d7)}` : ''
  const lNow = score != null ? `today ${formatSigned(score)}` : ''

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      className={`dbmeter ${size}`}
      role="img"
      aria-label={`Doom versus boom meter, today at ${formatSigned(score)}, 7-day ${formatSigned(d7)}, 30-day ${formatSigned(d30)}`}
    >
      <defs>
        <linearGradient id={grad} x1="0" x2="1">
          <stop offset="0" className="g-doom" />
          <stop offset="0.5" className="g-mid" />
          <stop offset="1" className="g-boom" />
        </linearGradient>
      </defs>
      <rect x={L} y={ty} width={W - L - R} height={10} rx={5} fill={`url(#${grad})`} />
      {[-1, -0.5, 0, 0.5, 1].map((v) => (
        <g key={v}>
          <line x1={cx(v)} y1={ty + 14} x2={cx(v)} y2={ty + 20} className="dbtick" />
          <text x={cx(v)} y={ty + lab} textAnchor="middle" className="dblab">
            {v === 0 ? '0' : formatSigned(v)}
          </text>
        </g>
      ))}
      <text x={L} y={ty - 14} className="dbend doom">
        ◀ DOOM
      </text>
      <text x={W - R} y={ty - 14} textAnchor="end" className="dbend boom">
        BOOM ▶
      </text>
      {d30 != null && (
        <g className="dbghost">
          <line x1={cx(d30)} y1={ty - 6} x2={cx(d30)} y2={ty + 16} />
          <text x={tx(cx(d30), l30, fs.ghost)} y={ty + g30} textAnchor="middle">
            {l30}
          </text>
        </g>
      )}
      {d7 != null && (
        <g className="dbghost">
          <line x1={cx(d7)} y1={ty - 6} x2={cx(d7)} y2={ty + 16} />
          <text x={tx(cx(d7), l7, fs.ghost)} y={ty + g7} textAnchor="middle">
            {l7}
          </text>
        </g>
      )}
      {score != null && (
        <>
          <g className="dbneedle">
            <line x1={cx(score)} y1={ty - 8} x2={cx(score)} y2={ty + 18} />
            <circle cx={cx(score)} cy={ty + 5} r={9} />
            <circle cx={cx(score)} cy={ty + 5} r={4} className="core" />
          </g>
          <text x={tx(cx(score), lNow, fs.now)} y={ty - now} textAnchor="middle" className="dbnow">
            {lNow}
          </text>
        </>
      )}
    </svg>
  )
}

/**
 * Chapter I — the day's mood in one reading. Reports of one development are
 * grouped into an event and counted once, each event weighted by relevance ×
 * impact × coverage: reading = (W_boom − W_doom) / (W_boom + W_doom).
 * Server-rendered SVG: the meter with 7- and 30-day ghost ticks, then per
 * side the event count, its share of the weight and the three heaviest
 * events. Both sides open the panel (`mood:boom` / `mood:doom`). Editions
 * composed before events-v1 carry no events and read story by story.
 */
export default function DoomBoomMeter({ score, counts, series, stories }: Props) {
  const hist = series.map((p) => p.score).filter((v): v is number => v != null)
  const d7 = avg(hist.slice(-7))
  const d30 = avg(hist)
  const tone = moodTone(score)
  const word = moodWord(score)
  const events = counts.method === 'events-v1' ? counts.events : undefined
  const pick = (side: 'boom' | 'doom'): Driver[] =>
    events
      ? eventDrivers(events, stories, side).map(({ lead, others }) => ({
          key: lead.id,
          url: lead.url,
          title: lead.title,
          source: lead.source,
          publishedAt: lead.publishedAt,
          also: others.map((o) => o.source ?? '—'),
        }))
      : moodDrivers(stories, side).map((s) => ({ key: s.id, url: s.url, title: s.title, source: s.source, publishedAt: s.publishedAt, also: [] }))
  const boom = pick('boom')
  const doom = pick('doom')
  const weight = events ? counts.weight : undefined
  const totalWeight = weight ? weight.boom + weight.doom : 0
  const share = (side: 'boom' | 'doom') => {
    if (!weight || totalWeight <= 0) return null
    const reports = counts.stories?.[side] ?? 0
    const pct = Math.round((weight[side] / totalWeight) * 100)
    return `${pct}% of the weight${reports > counts[side] ? ` · from ${reports} reports` : ''}`
  }

  const drivers = (list: Driver[], cls: 'boom' | 'doom') =>
    list.map((d) => (
      <a
        key={d.key}
        href={d.url}
        target="_blank"
        rel="noopener"
        className={`drv ${cls}`}
        data-panel-ignore=""
        title={d.also.length ? `Also reported by ${d.also.join(', ')}` : undefined}
      >
        <b>{d.title}</b>
        <span>
          {d.source ?? '—'}
          {d.also.length > 0 && <em className="drv-more"> +{d.also.length}</em>} · {hm(d.publishedAt)}
        </span>
      </a>
    ))
  const boomShareText = share('boom')
  const doomShareText = share('doom')

  return (
    <div className="gcard wide db" id="doomboom">
      <div className="db-head">
        <div className="db-verdict">
          <span className={`db-word ${tone === 'mid' ? '' : tone}`}>{word}</span>
          <span className="db-score mono">{formatSigned(score)}</span>
        </div>
        <div className="db-legend">
          <span>
            <i className="boom" />
            Expansion, demand, deals → +1
          </span>
          <span>
            <i className="doom" />
            Freezes, pauses, warnings → −1
          </span>
          <span>
            <i className="mid" />
            Neutral, excluded
          </span>
          {events && <span className="db-note">Each event counts once, weighted by relevance × impact</span>}
        </div>
      </div>

      <Meter size="wide" score={score} d7={d7} d30={d30} />
      <Meter size="narrow" score={score} d7={d7} d30={d30} />

      <div className="db-sides">
        <button type="button" className="db-side doom" data-panel="mood:doom">
          <span className="db-n">
            {counts.doom}
            <small>doom stories</small>
          </span>
          {doomShareText && <span className="db-share">{doomShareText}</span>}
          <span className="db-drivers">{drivers(doom, 'doom')}</span>
          <span className="go">Open the doom side →</span>
        </button>
        <button type="button" className="db-side boom" data-panel="mood:boom">
          <span className="db-n">
            {counts.boom}
            <small>boom stories</small>
          </span>
          {boomShareText && <span className="db-share">{boomShareText}</span>}
          <span className="db-drivers">{drivers(boom, 'boom')}</span>
          <span className="go">Open the boom side →</span>
        </button>
      </div>
    </div>
  )
}
