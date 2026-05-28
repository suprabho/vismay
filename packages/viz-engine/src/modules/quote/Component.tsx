'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '../../types'
import { formatInlineMarkdown, getListItems, isListBlock } from '../../lib/inlineMarkdown'
import type { QuoteLayerConfig } from './index'

const ALIGN_CLASSES: Record<NonNullable<QuoteLayerConfig['align']>, string> = {
  left: 'items-start text-left',
  center: 'items-center text-center',
  right: 'items-end text-right',
}

export default function QuoteLayerComponent({
  config,
  noteReady,
}: VizRenderProps<QuoteLayerConfig>) {
  useEffect(() => {
    noteReady()
  }, [noteReady])

  const align = config.align ?? 'left'
  const alignClasses = ALIGN_CLASSES[align]

  return (
    <blockquote
      className={`w-full h-full flex flex-col justify-center ${alignClasses}`}
      style={{ margin: 0 }}
    >
      {isListBlock(config.text) ? (
        // Drop the curly quote ornaments for list-shaped quotes — wrapping a
        // bulleted list in “…” reads as a typo. The blockquote element still
        // carries the semantic "this is a quotation" meaning.
        <ul
          className="font-serif italic leading-snug list-disc pl-5 m-0"
          style={{
            color: 'var(--color-text)',
            fontSize: 'clamp(1.4rem, 2.2vw, 1.85rem)',
            maxWidth: '32ch',
          }}
        >
          {getListItems(config.text).map((item, j) => (
            <li key={j}>{formatInlineMarkdown(item)}</li>
          ))}
        </ul>
      ) : (
        <p
          className="font-serif italic leading-snug"
          style={{
            color: 'var(--color-text)',
            fontSize: 'clamp(1.4rem, 2.2vw, 1.85rem)',
            maxWidth: '32ch',
          }}
        >
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              marginRight: '0.25em',
              opacity: 0.5,
              transform: 'translateY(-0.1em)',
            }}
          >
            “
          </span>
          {formatInlineMarkdown(config.text)}
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              marginLeft: '0.1em',
              opacity: 0.5,
              transform: 'translateY(-0.1em)',
            }}
          >
            ”
          </span>
        </p>
      )}
      {config.attribution && (
        <cite
          className="font-mono mt-4 not-italic uppercase tracking-[0.15em]"
          style={{
            color: 'var(--color-muted)',
            fontSize: '0.75rem',
          }}
        >
          — {config.attribution}
        </cite>
      )}
    </blockquote>
  )
}
