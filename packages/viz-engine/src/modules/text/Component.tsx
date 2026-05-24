'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '../../types'
import type { StatColor } from '../../lib/storyConfig.types'
import { formatInlineMarkdown } from '../../lib/inlineMarkdown'
import { useForegroundContent } from '../../lib/foregroundContent'
import type { TextLayerConfig } from './index'

function statColorVar(token?: StatColor): string {
  return `var(--color-${token ?? 'accent2'})`
}

function toParagraphs(content: string | string[] | undefined): string[] | null {
  if (content == null) return null
  if (typeof content === 'string') return [content]
  return content
}

export default function TextLayerComponent({
  config,
  noteReady,
}: VizRenderProps<TextLayerConfig>) {
  // Readiness profile is 'instant' — fire on mount so the PDF capture flow
  // doesn't wait on a text panel that has no async work.
  useEffect(() => {
    noteReady()
  }, [noteReady])

  const ctx = useForegroundContent()
  const unit = ctx?.unit
  const heading = config.heading ?? unit?.heading
  const subheading = config.subheading ?? unit?.subheading
  const inlineContent = toParagraphs(config.content)
  const paragraphs = inlineContent ?? unit?.paragraphs ?? []
  const kind = config.kind ?? 'text'

  if (kind === 'stat' && heading) {
    return (
      <StatPanel
        value={heading}
        subheading={subheading}
        description={paragraphs.join(' ')}
        color={config.color}
      />
    )
  }

  return <TextPanel heading={heading} paragraphs={paragraphs} />
}

function TextPanel({
  heading,
  paragraphs,
}: {
  heading: string | undefined
  paragraphs: string[]
}) {
  return (
    <div className="w-full max-w-[820px] mx-auto h-full flex flex-col justify-center">
      {heading && (
        <div
          className="font-[family-name:var(--font-mono)] text-[1rem] uppercase tracking-[0.15em] mb-3"
          style={{ color: 'var(--color-accent)' }}
        >
          {heading}
        </div>
      )}
      {paragraphs.length > 0 ? (
        paragraphs.map((p, i) => (
          <p
            key={i}
            className="font-[family-name:var(--font-serif)] text-[1.4rem] md:text-[1rem] leading-[1.7] mb-3 last:mb-0"
            style={{ color: 'var(--color-text)' }}
          >
            {formatInlineMarkdown(p)}
          </p>
        ))
      ) : (
        <p
          className="font-[family-name:var(--font-mono)] text-[0.7rem] opacity-60"
          style={{ color: 'var(--color-muted, #aca286)' }}
        >
          [text layer: no content]
        </p>
      )}
    </div>
  )
}

function StatPanel({
  value,
  subheading,
  description,
  color: colorToken,
}: {
  value: string
  subheading?: string
  description: string
  color?: StatColor
}) {
  const color = statColorVar(colorToken)
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center py-4">
      <div
        className="font-serif text-[clamp(3.5rem,11vw,7.5rem)] font-bold leading-none mb-3"
        style={{ color }}
      >
        {value}
      </div>
      {subheading && (
        <div
          className="font-mono text-[0.65rem] uppercase tracking-[0.15em] mb-3"
          style={{ color: 'var(--color-accent)' }}
        >
          {subheading}
        </div>
      )}
      <div
        className="font-sans text-[0.95rem] max-w-[440px] leading-[1.55]"
        style={{ color: 'var(--color-muted)' }}
      >
        {description}
      </div>
    </div>
  )
}
