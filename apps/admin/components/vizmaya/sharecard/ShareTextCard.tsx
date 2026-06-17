'use client'

// Ported from apps/vizmaya-fyi/components/share/ShareTextCard.tsx.

import PretextBlock from './PretextBlock'
import FitScale from './FitScale'
import type { AspectRatio } from './AspectRatioToggle'

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
  ratio?: AspectRatio
}

const BODY_FONT_SIZE = 16
const BODY_LINE_HEIGHT = 27

export default function ShareTextCard({
  heading,
  subheading,
  paragraphs,
  hidePretext = false,
  ratio = '3:4',
}: Props) {
  // Landscape (4:3) is wide but short — use the extra width for a longer text
  // measure (fewer lines → less height) before FitScale has to shrink anything.
  const textWidth = ratio === '4:3' ? 430 : 310

  return (
    <div className="h-full px-[44px] pt-[56px] pb-[40px] min-h-0">
      <FitScale>
        <div className="flex flex-col">
          {heading && (
            <div
              className="font-[family-name:var(--font-mono)] text-[13px] uppercase tracking-[0.15em] mb-[10px]"
              style={{ color: 'var(--color-accent)' }}
            >
              {heading}
            </div>
          )}
          {subheading && (
            <div
              className="font-serif text-[19px] leading-[1.3] mb-[20px]"
              style={{ color: 'var(--color-muted)' }}
            >
              {subheading}
            </div>
          )}
          {!hidePretext &&
            paragraphs.map((p, i) => (
              <div key={i} className={i < paragraphs.length - 1 ? 'mb-[15px]' : ''}>
                <PretextBlock
                  text={stripMarkdown(p)}
                  fontSize={BODY_FONT_SIZE}
                  lineHeight={BODY_LINE_HEIGHT}
                  maxWidth={textWidth}
                  color="var(--color-text)"
                />
              </div>
            ))}
        </div>
      </FitScale>
    </div>
  )
}
