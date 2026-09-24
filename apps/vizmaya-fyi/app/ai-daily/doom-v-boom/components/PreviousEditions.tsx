import Link from 'next/link'
import type { DcEditionSummary } from '@vismay/content-source/dcEditionTypes'
import { formatEditionDate } from '@vismay/content-source/dcEditionTypes'
import { editionHref } from './editionUtils'

/** The archive rail: the last four editions, the current one highlighted. */
export default function PreviousEditions({ current, previous }: { current: DcEditionSummary; previous: DcEditionSummary[] }) {
  const rail = [current, ...previous.filter((p) => p.date !== current.date)].slice(0, 4)
  return (
    <div className="rail">
      {rail.map((e) => (
        <Link className={`ed${e.date === current.date ? ' current' : ''}`} href={e.date === current.date ? '#top' : editionHref(e.date)} key={e.date}>
          <span className="d">
            <span>{formatEditionDate(e.date, { year: false })}</span>
            <span>{e.number != null ? `№ ${e.number}` : 'draft'}</span>
          </span>
          <span className="h">{e.headline}</span>
          <span className="c">
            {e.counts.stories} stories · {e.counts.papers} papers
          </span>
        </Link>
      ))}
    </div>
  )
}
