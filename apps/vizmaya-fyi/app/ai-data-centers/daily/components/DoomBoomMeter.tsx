import type { DcEditionStory, EditionMoodCounts, EditionMoodPoint } from '@vismay/content-source/dcEditionTypes'
import { formatSigned, moodTone, moodWord } from '@vismay/content-source/dcEditionTypes'
import { moodDrivers } from '@vismay/content-source/dcEditionAssembly'
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

/**
 * Chapter I — the day's mood in one reading, scored story by story:
 * reading = (boom − doom) / (boom + doom). Server-rendered SVG: the meter
 * with 7- and 30-day ghost ticks, and the top three drivers per side. Both
 * sides open the panel (`mood:boom` / `mood:doom`).
 */
export default function DoomBoomMeter({ score, counts, series, stories }: Props) {
  const hist = series.map((p) => p.score).filter((v): v is number => v != null)
  const d7 = avg(hist.slice(-7))
  const d30 = avg(hist)
  const tone = moodTone(score)
  const word = moodWord(score)
  const boom = moodDrivers(stories, 'boom')
  const doom = moodDrivers(stories, 'doom')

  const W = 1000
  const H = 120
  const L = 60
  const R = 60
  const ty = 52
  const cx = (v: number) => L + ((v + 1) / 2) * (W - L - R)

  const drivers = (list: DcEditionStory[], cls: 'boom' | 'doom') =>
    list.map((s) => (
      <a key={s.id} href={s.url} target="_blank" rel="noopener" className={`drv ${cls}`} data-panel-ignore="">
        <b>{s.title}</b>
        <span>
          {s.source ?? '—'} · {hm(s.publishedAt)}
        </span>
      </a>
    ))

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
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="dbmeter"
        role="img"
        aria-label={`Doom versus boom meter, today at ${formatSigned(score)}, 7-day ${formatSigned(d7)}, 30-day ${formatSigned(d30)}`}
      >
        <defs>
          <linearGradient id="dbgrad" x1="0" x2="1">
            <stop offset="0" className="g-doom" />
            <stop offset="0.5" className="g-mid" />
            <stop offset="1" className="g-boom" />
          </linearGradient>
        </defs>
        <rect x={L} y={ty} width={W - L - R} height={10} rx={5} fill="url(#dbgrad)" />
        {[-1, -0.5, 0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={cx(v)} y1={ty + 14} x2={cx(v)} y2={ty + 20} className="dbtick" />
            <text x={cx(v)} y={ty + 34} textAnchor="middle" className="dblab">
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
            <text x={cx(d30)} y={ty + 48} textAnchor="middle">
              30-day {formatSigned(d30)}
            </text>
          </g>
        )}
        {d7 != null && (
          <g className="dbghost">
            <line x1={cx(d7)} y1={ty - 6} x2={cx(d7)} y2={ty + 16} />
            <text x={cx(d7)} y={ty + 62} textAnchor="middle">
              7-day {formatSigned(d7)}
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
            <text x={cx(score)} y={ty - 26} textAnchor="middle" className="dbnow">
              today {formatSigned(score)}
            </text>
          </>
        )}
      </svg>

      <div className="db-sides">
        <button type="button" className="db-side doom" data-panel="mood:doom">
          <span className="db-n">
            {counts.doom}
            <small>doom stories</small>
          </span>
          <span className="db-drivers">{drivers(doom, 'doom')}</span>
          <span className="go">Open the doom side →</span>
        </button>
        <button type="button" className="db-side boom" data-panel="mood:boom">
          <span className="db-n">
            {counts.boom}
            <small>boom stories</small>
          </span>
          <span className="db-drivers">{drivers(boom, 'boom')}</span>
          <span className="go">Open the boom side →</span>
        </button>
      </div>
    </div>
  )
}
