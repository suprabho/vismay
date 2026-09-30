import Link from 'next/link'
import type { EditionContinuing } from '@vismay/content-source/dcEditionTypes'
import { formatEditionDate } from '@vismay/content-source/dcEditionTypes'
import SourceChip from './SourceChip'
import { editionHref } from './editionUtils'

/**
 * "Still developing" — threads an earlier edition already carried that drew
 * more reports in this window. They sit under the key notes rather than in
 * them, so a development leads one morning, not three; each links back to the
 * edition that first ran it. Editions composed before migration 082 carry
 * none and render nothing here.
 */
export default function Continuing({ items, linkSince = true }: { items: EditionContinuing[]; linkSince?: boolean }) {
  if (items.length === 0) return null
  return (
    <div className="continuing">
      <div className="continuing-head">
        <h3>Still developing</h3>
        <p>Threads earlier editions carried that drew more reports in this window.</p>
      </div>
      <div className="notes">
        {items.map((c, i) => {
          const since = `Since ${formatEditionDate(c.since, { year: false })}`
          return (
            <article className="note" key={i}>
              <span className="mark" aria-hidden="true" />
              <div>
                <p>
                  <b>{/[.!?…]$/.test(c.label) ? c.label : `${c.label}.`}</b> {c.text}
                </p>
                <div className="tail">
                  {linkSince ? (
                    <Link className="tag" href={editionHref(c.since)} title={`Open the ${formatEditionDate(c.since)} edition`}>
                      {since} →
                    </Link>
                  ) : (
                    <span className="tag">{since}</span>
                  )}
                  {c.sources.map((s) => (
                    <SourceChip key={s.url} source={s} />
                  ))}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
