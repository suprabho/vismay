import { normalizeText } from '../text'

const words = (s: string): Set<string> => new Set(normalizeText(s).split(/[^a-z0-9]+/).filter((w) => w.length > 3))

/** Share of the query title's longer words the other title also has (1 when the query has none). */
export function titleOverlap(query: string, other: string): number {
  const a = words(query)
  const b = words(other)
  if (!a.size) return 1
  let hit = 0
  for (const w of a) if (b.has(w)) hit++
  return hit / a.size
}
