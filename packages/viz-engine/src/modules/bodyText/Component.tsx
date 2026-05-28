'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '../../types'
import { formatInlineMarkdown, getListItems, isListBlock } from '../../lib/inlineMarkdown'
import { useForegroundContent } from '../../lib/foregroundContent'
import type { BodyTextColor, BodyTextLayerConfig, BodyTextSize } from './index'

const SIZE_TO_FONT: Record<BodyTextSize, string> = {
  small: '0.9rem',
  normal: '1.15rem',
  large: '1.4rem',
}

const SIZE_TO_LEADING: Record<BodyTextSize, string> = {
  small: '1.55',
  normal: '1.65',
  large: '1.7',
}

const COLOR_TO_VAR: Record<BodyTextColor, string> = {
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  accent: 'var(--color-accent)',
  accent2: 'var(--color-accent2)',
}

function toParagraphs(content: string | string[] | undefined): string[] | null {
  if (content == null) return null
  if (typeof content === 'string') return [content]
  return content
}

export default function BodyTextLayerComponent({
  config,
  noteReady,
}: VizRenderProps<BodyTextLayerConfig>) {
  useEffect(() => {
    noteReady()
  }, [noteReady])

  const ctx = useForegroundContent()
  const unit = ctx?.unit
  const inline = toParagraphs(config.content)
  const paragraphs = inline ?? unit?.paragraphs ?? []
  const heading = config.showHeading ? (config.heading ?? unit?.heading) : undefined

  const size = config.textStyle?.size ?? 'normal'
  const colorToken = config.textStyle?.color ?? 'text'
  const fontSize = SIZE_TO_FONT[size]
  const lineHeight = SIZE_TO_LEADING[size]
  const color = COLOR_TO_VAR[colorToken]

  return (
    <div className="w-full h-full flex flex-col justify-center">
      {heading && (
        <div
          className="font-mono uppercase tracking-[0.15em] mb-4"
          style={{
            color: 'var(--color-accent)',
            fontSize: '0.85rem',
          }}
        >
          {heading}
        </div>
      )}
      {paragraphs.length > 0 ? (
        paragraphs.map((p, i) =>
          isListBlock(p) ? (
            <ul
              key={i}
              className="font-serif mb-3 last:mb-0 list-disc pl-5"
              style={{ color, fontSize, lineHeight }}
            >
              {getListItems(p).map((item, j) => (
                <li key={j}>{formatInlineMarkdown(item)}</li>
              ))}
            </ul>
          ) : (
            <p
              key={i}
              className="font-serif mb-3 last:mb-0"
              style={{ color, fontSize, lineHeight }}
            >
              {formatInlineMarkdown(p)}
            </p>
          )
        )
      ) : (
        <p
          className="font-mono opacity-60"
          style={{ color: 'var(--color-muted)', fontSize: '0.7rem' }}
        >
          [bodyText: no content resolved]
        </p>
      )}
    </div>
  )
}
