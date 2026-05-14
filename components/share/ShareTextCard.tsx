'use client'

import PretextBlock from './PretextBlock'

/** Strip basic markdown bold/italic markers for plain-text layout. */
function stripMarkdown(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')
}

interface Props {
  heading?: string
  subheading?: string
  paragraphs: string[]
  /** When true, suppress the body PretextBlock paragraphs entirely. */
  hidePretext?: boolean
}

const BODY_FONT_SIZE = 16
const BODY_LINE_HEIGHT = 27
/** Card inner width: 390px base - 80px horizontal padding */
const TEXT_WIDTH = 310

export default function ShareTextCard({ heading, subheading, paragraphs, hidePretext = false }: Props) {
  return (
    <div className="flex flex-col justify-center h-full px-10 pt-12 pb-8 overflow-hidden min-h-0">
      {heading && (
        <div
          className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.15em] mb-2"
          style={{ color: 'var(--color-accent)' }}
        >
          {heading}
        </div>
      )}
      {subheading && (
        <div
          className="font-serif text-[0.95rem] leading-[1.3] mb-4"
          style={{ color: 'var(--color-muted)' }}
        >
          {subheading}
        </div>
      )}
      {!hidePretext && paragraphs.map((p, i) => (
        <div key={i} className={i < paragraphs.length - 1 ? 'mb-3' : ''}>
          <PretextBlock
            text={stripMarkdown(p)}
            fontSize={BODY_FONT_SIZE}
            lineHeight={BODY_LINE_HEIGHT}
            maxWidth={TEXT_WIDTH}
            color="var(--color-text)"
          />
        </div>
      ))}
    </div>
  )
}
