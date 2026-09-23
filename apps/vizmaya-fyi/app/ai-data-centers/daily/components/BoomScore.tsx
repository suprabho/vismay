import type { CSSProperties } from 'react'
import { formatSigned, moodTone, moodWord } from '@vismay/content-source/dcEditionTypes'
import BoomRing from './BoomRing'
import { boomShare, ringStaticDots } from './particleRing'

/** One seed for the canvas and the dots painted under it, so both draw the same ring. */
const SEED = 7
const FIRST_PAINT = ringStaticDots(72, SEED)

interface Props {
  score: number | null
}

/**
 * The hero's Boom Score: the Doom v Boom reading as a score out of 100 — the
 * boom share of the weighted events (each development counted once, weighted
 * by relevance × impact × coverage; the share of boom stories on editions
 * before events-v1) — inside the particle ring, with the signed reading
 * beneath it and the word under the ring. Server component:
 * the ring's canvas (BoomRing) is the only client code, and the dots painted
 * here stand in for it until its first frame.
 */
export default function BoomScore({ score }: Props) {
  const share = score == null ? null : boomShare(score)
  const value = share == null ? null : Math.round(share * 100)
  const label =
    score == null
      ? 'Doom v Boom: unscored. No story in this window carried a mood score.'
      : `Boom Score ${value} out of 100 (Doom v Boom reading ${formatSigned(score)})`

  return (
    <figure
      className="boomscore"
      data-tone={moodTone(score)}
      data-unscored={score == null ? '' : undefined}
      style={{ '--t': share == null ? 0.5 : Math.round(share * 1000) / 1000 } as CSSProperties}
    >
      <div className="boomscore-ring" role="img" aria-label={label}>
        <BoomRing score={score} seed={SEED} />
        <svg className="boomscore-dots" viewBox="0 0 100 100" aria-hidden="true">
          {FIRST_PAINT.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} />
          ))}
        </svg>
        <span className="boomscore-centre" aria-hidden="true">
          <span className="boomscore-eyebrow">{score == null ? 'Doom v Boom' : 'Boom Score'}</span>
          <span className="boomscore-num">{value ?? '—'}</span>
          <span className="boomscore-signed">{score == null ? 'unscored' : formatSigned(score)}</span>
        </span>
      </div>
      <figcaption className="boomscore-cap">
        <span className="boomscore-word">{moodWord(score)}</span>
      </figcaption>
    </figure>
  )
}
