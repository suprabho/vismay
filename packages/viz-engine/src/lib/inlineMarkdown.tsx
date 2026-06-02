import { ReactNode } from 'react'

/**
 * Render a string of inline markdown with **bold** and *italic* support.
 * Bold renders with the accent color and mono font; italic renders as <em>.
 *
 * Lives in the engine so the text module and the various app-level prose
 * renderers (ProseSection, ScrollySection, MapEditShell) all share one
 * implementation and can't drift apart.
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

/**
 * Treat a paragraph as a bulleted list when every non-empty line begins
 * with "- ". The content splitter (content.ts) splits on blank lines only,
 * so consecutive `- a\n- b\n- c` lines arrive here as one paragraph string —
 * exactly the shape this check expects.
 *
 * Strict on purpose: a paragraph that starts with a dashed word ("- but —")
 * isn't a list, because subsequent non-empty lines wouldn't share the prefix.
 */
export function isListBlock(text: string): boolean {
  const lines = text.split('\n').filter((line) => line.trim().length > 0)
  if (lines.length === 0) return false
  return lines.every((line) => /^- /.test(line))
}

/** Items for a list block. Strips the leading "- " from each non-empty line. */
export function getListItems(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => line.replace(/^- /, ''))
}
