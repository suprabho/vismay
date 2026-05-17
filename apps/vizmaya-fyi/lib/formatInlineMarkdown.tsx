import { ReactNode } from 'react'

/**
 * Render a string of inline markdown with **bold** and *italic* support.
 * Bold renders with the accent color and mono font; italic renders as <em>.
 *
 * Used by ProseSection, ScrollySection, and MapStorySection so the inline
 * formatting is consistent across all story prose.
 */
export function formatInlineMarkdown(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/)
    const italicMatch = remaining.match(/(?<!\*)\*([^*]+)\*(?!\*)/)

    const firstMatch = [boldMatch, italicMatch]
      .filter(Boolean)
      .sort((a, b) => (a!.index ?? 0) - (b!.index ?? 0))[0]

    if (!firstMatch || firstMatch.index === undefined) {
      parts.push(remaining)
      break
    }

    if (firstMatch.index > 0) {
      parts.push(remaining.slice(0, firstMatch.index))
    }

    if (firstMatch === boldMatch) {
      parts.push(
        <strong
          key={key++}
          className="font-[family-name:var(--font-mono)] font-bold"
          style={{ color: 'var(--color-accent)' }}
        >
          {firstMatch[1]}
        </strong>
      )
    } else {
      parts.push(<em key={key++}>{firstMatch[1]}</em>)
    }

    remaining = remaining.slice(firstMatch.index + firstMatch[0].length)
  }

  return parts
}
