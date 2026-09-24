import type { EditionSource } from '@vismay/content-source/dcEditionTypes'

/** A backlink chip — every claim on the page links to the reporting it rests on. */
export default function SourceChip({
  source,
  energy = false,
  paper = false,
}: {
  source: EditionSource
  energy?: boolean
  paper?: boolean
}) {
  return (
    <a className={`src${paper ? ' paper' : ''}${energy ? ' energy' : ''}`} href={source.url} target="_blank" rel="noopener">
      <span>{source.name}</span>
    </a>
  )
}
