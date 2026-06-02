'use client'

import { useRef } from 'react'
import { useInView } from '../../lib/use-in-view'
import { ProseBlock } from '@vismay/viz-engine'
import { formatInlineMarkdown, getListItems, isListBlock } from '@vismay/viz-engine'

export default function ProseSection({ block }: { block: ProseBlock }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { threshold: 0.1 })

  return (
    <section
      ref={ref}
      className="max-w-[640px] mx-auto px-8 py-16 transition-opacity duration-700"
      style={{ opacity: isInView ? 1 : 0 }}
    >
      {block.paragraphs.map((p, i) =>
        isListBlock(p) ? (
          <ul
            key={i}
            className="font-[family-name:var(--font-serif)] text-[1.15rem] leading-[1.85] mb-6 list-disc pl-5"
            style={{ color: 'var(--color-text)' }}
          >
            {getListItems(p).map((item, j) => (
              <li key={j}>{formatInlineMarkdown(item)}</li>
            ))}
          </ul>
        ) : (
          <p
            key={i}
            className="font-[family-name:var(--font-serif)] text-[1.15rem] leading-[1.85] mb-6"
            style={{ color: 'var(--color-text)' }}
          >
            {formatInlineMarkdown(p)}
          </p>
        )
      )}
    </section>
  )
}
