import { ContentSection } from './content'

/**
 * Resolve a YAML config anchor like "Act II > The misleading spike"
 * to a specific ContentSection from the parsed markdown.
 *
 * Path semantics:
 *   - Segments are split on `>` and trimmed.
 *   - Each segment matches the next-deeper heading by normalized startsWith.
 *   - Normalization is case-insensitive and tolerant of dashes / extra whitespace.
 *   - A leading "Act N:" prefix on a heading is stripped before matching, so
 *     `"Act II > The misleading spike"` resolves to `## Act II: The chokepoint...`
 *     followed by `### The misleading spike`.
 *
 * Returns the matched section, or undefined on miss. Callers should warn but
 * not crash on miss — a typo in YAML shouldn't kill the whole story render.
 */
export function resolveAnchor(
  sections: ContentSection[],
  anchor: string
): ContentSection | undefined {
  const segments = anchor.split('>').map((s) => s.trim()).filter(Boolean)
  if (segments.length === 0) return undefined

  // Find first segment as a top-level (level 1 or 2) heading.
  const parentIdx = sections.findIndex(
    (s) => s.level > 0 && s.level <= 2 && headingMatches(s.heading, segments[0])
  )
  if (parentIdx === -1) return undefined
  if (segments.length === 1) return sections[parentIdx]

  // Walk forward from parent looking for each subsequent segment as a deeper heading.
  let cursor = parentIdx
  let parentLevel = sections[parentIdx].level
  for (let segIdx = 1; segIdx < segments.length; segIdx++) {
    let found = -1
    for (let i = cursor + 1; i < sections.length; i++) {
      const s = sections[i]
      // Stop if we hit a sibling or shallower heading — the parent's scope ended.
      if (s.level <= parentLevel) break
      if (headingMatches(s.heading, segments[segIdx])) {
        found = i
        break
      }
    }
    if (found === -1) return undefined
    cursor = found
    parentLevel = sections[found].level
  }

  return sections[cursor]
}

/**
 * Compare a markdown heading against a config segment.
 *
 * Tolerates:
 *   - Case differences
 *   - Em/en dashes vs hyphens
 *   - A leading "Act N:" prefix on either side (so `"Act I"` matches the heading
 *     `"Act I: The most consequential..."`, and `"The most consequential"` matches it too)
 *   - Trailing punctuation after the matched prefix (`"Foo"` matches `"Foo: bar"`,
 *     `"Foo. bar"`, `"Foo — bar"`, etc.)
 */
function headingMatches(heading: string, segment: string): boolean {
  const headingForms = [normalize(heading), stripActPrefix(normalize(heading))]
  const segmentForms = [normalize(segment), stripActPrefix(normalize(segment))]

  for (const h of headingForms) {
    for (const s of segmentForms) {
      if (!s) continue
      if (h === s) return true
      // Match if heading starts with segment AND the next char is a word boundary.
      if (h.startsWith(s)) {
        const next = h.charAt(s.length)
        if (next === '' || /[^a-z0-9]/.test(next)) return true
      }
    }
  }
  return false
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripActPrefix(s: string): string {
  return s.replace(/^act\s+[ivxlc]+\s*:?\s*/i, '').trim()
}
