import type { EditionNote } from '@vismay/content-source/dcEditionTypes'
import SourceChip from './SourceChip'

/**
 * Chapter II — six things to carry out of the day, each led by the number
 * that matters. Notes without a grounded lead figure render as prose only.
 */
export default function KeyNotes({ notes }: { notes: EditionNote[] }) {
  if (notes.length === 0) {
    return <p className="notice">No key notes were composed for this window.</p>
  }
  return (
    <div className="signals">
      {notes.map((n, i) => (
        <article className={`signal${n.energy ? ' energy' : ''}`} key={i}>
          {n.metric ? (
            <>
              <div className="sig-num">
                {n.metric}
                {n.unit && <small>{n.unit}</small>}
              </div>
              <div className="sig-lab">{n.label}</div>
            </>
          ) : (
            <div className="sig-lab solo">{n.label}</div>
          )}
          <p>
            <Lead text={n.text} />
          </p>
          <div className="tail">
            {n.sources.map((s) => (
              <SourceChip key={s.url} source={s} energy={n.energy} />
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}

/** Bold the first sentence — the takeaway — as the design does. */
function Lead({ text }: { text: string }) {
  const m = text.match(/^(.+?[.!?])(\s+[\s\S]*)?$/)
  if (!m || !m[2]) return <>{text}</>
  return (
    <>
      <b>{m[1]}</b>
      {m[2]}
    </>
  )
}
