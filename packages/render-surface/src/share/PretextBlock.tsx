'use client'

import { useRef, useEffect, useState } from 'react'
import {
  prepareWithSegments,
  layoutWithLines,
  type LayoutLine,
} from '@chenglou/pretext'

interface Props {
  /** Plain text to lay out (markdown stripped). */
  text: string
  /** Font size in px */
  fontSize: number
  /** Line height in px */
  lineHeight: number
  /** Available width in px for line-breaking */
  maxWidth: number
  /** CSS color */
  color?: string
  /** Optional className on the container */
  className?: string
}

interface PositionedLine {
  text: string
  y: number
  width: number
}

/**
 * Renders text using @chenglou/pretext for typographic line-breaking.
 * Reads --font-serif from the DOM at runtime so it matches the theme.
 * Produces absolutely-positioned <span> lines — static, no reflow.
 */
export default function PretextBlock({
  text,
  fontSize,
  lineHeight,
  maxWidth,
  color = 'var(--color-text)',
  className,
}: Props) {
  const [lines, setLines] = useState<PositionedLine[]>([])
  const [totalHeight, setTotalHeight] = useState(0)
  const [resolvedFont, setResolvedFont] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Resolve the font family from CSS variables once mounted
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const family = getComputedStyle(el).getPropertyValue('--font-serif').trim()
    if (family) {
      setResolvedFont(`${fontSize}px ${family}`)
    } else {
      setResolvedFont(`${fontSize}px serif`)
    }
  }, [fontSize])

  // Run pretext layout once font is resolved
  useEffect(() => {
    if (!text || maxWidth <= 0 || !resolvedFont) {
      setLines([])
      setTotalHeight(0)
      return
    }

    document.fonts.ready.then(() => {
      const prepared = prepareWithSegments(text, resolvedFont)
      const result = layoutWithLines(prepared, maxWidth, lineHeight)

      const positioned: PositionedLine[] = result.lines.map(
        (line: LayoutLine, i: number) => ({
          text: line.text,
          y: i * lineHeight,
          width: line.width,
        })
      )

      setLines(positioned)
      setTotalHeight(result.height)
    })
  }, [text, resolvedFont, lineHeight, maxWidth])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', height: totalHeight, width: maxWidth }}
    >
      {lines.map((line, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: 0,
            top: line.y,
            fontFamily: 'var(--font-serif)',
            fontSize,
            lineHeight: `${lineHeight}px`,
            color,
            whiteSpace: 'pre',
          }}
        >
          {line.text}
        </span>
      ))}
    </div>
  )
}
