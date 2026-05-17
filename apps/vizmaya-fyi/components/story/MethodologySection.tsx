import { ReactNode } from 'react'
import { MethodologyBlock } from '@/types/story'

function formatBoldText(text: string) {
  const parts: ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    const match = remaining.match(/\*\*([^*]+)\*\*/)
    if (!match || match.index === undefined) {
      parts.push(remaining)
      break
    }
    if (match.index > 0) parts.push(remaining.slice(0, match.index))
    parts.push(
      <strong key={key++} className="text-white font-semibold">
        {match[1]}
      </strong>
    )
    remaining = remaining.slice(match.index + match[0].length)
  }

  return parts
}

export default function MethodologySection({ block }: { block: MethodologyBlock }) {
  return (
    <section
      className="max-w-[640px] mx-auto px-8 pt-16 pb-24"
      style={{ borderTop: '0.5px solid var(--color-line, #1a2830)' }}
    >
      <h3
        className="font-[family-name:var(--font-sans)] text-[0.8rem] uppercase tracking-[0.12em] mb-4"
        style={{ color: 'var(--color-muted)' }}
      >
        Methodology & sources
      </h3>
      {block.content.map((p, i) => (
        <p
          key={i}
          className="font-[family-name:var(--font-sans)] text-[0.85rem] leading-[1.7] mb-3"
          style={{ color: 'var(--color-muted)' }}
        >
          {formatBoldText(p)}
        </p>
      ))}
    </section>
  )
}
