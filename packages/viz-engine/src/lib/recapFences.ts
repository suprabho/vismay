/**
 * Recap `fs:` directive contract.
 *
 * Daily-recap markdown can embed footshorts viz modules as fenced code blocks
 * whose info-string is the module type and whose body is a JSON object of the
 * module's foreground config (the `type` field is implied by the info-string,
 * so the body may omit it):
 *
 *   ```fs:match-card
 *   { "layout": "score", "home": "Arsenal", "away": "Chelsea", "score": "2 – 1" }
 *   ```
 *
 * JSON (not YAML) so the dependency-free recap renderer can parse the body with
 * a plain `JSON.parse`. One contract, three consumers:
 *   - the recap generator (worker/src/recap.ts) emits these fences,
 *   - the recap viewer (@vismay/ui RecapMarkdown) mounts them as live modules,
 *   - story-gen (@vismay/story-pipeline) ingests them into a section foreground.
 *
 * The leading `fs:` namespace is what distinguishes a viz directive from an
 * ordinary ```json / ```ts code block, so non-fs fences pass through untouched.
 */

/** A single parsed `fs:` directive lifted from recap markdown. */
export interface FsDirective {
  /** Full module type, e.g. `fs:match-card`. */
  type: string
  /**
   * The parsed config object with `type` guaranteed present (back-filled from
   * the info-string when the body omits it). Ready to hand to `parseConfig`.
   */
  config: Record<string, unknown>
}

/**
 * Matches a fence opener whose info-string names an `fs:` module, capturing the
 * type. Tolerates an optional language hint after the type (```fs:match-card json).
 * Anchored per-line via the `m` flag; `extractFsDirectives` scans line-by-line
 * so this is only used to recognise the opener.
 */
export const FS_FENCE_OPEN = /^```(fs:[a-z0-9-]+)\b/

/** A bare closing fence line. */
export const FENCE_CLOSE = /^```\s*$/

/**
 * Pull every `fs:` directive out of recap markdown, in document order. Bodies
 * that fail to parse as JSON, or that aren't a JSON object, are skipped (the
 * caller — viewer or ingest — degrades that block to plain text rather than
 * throwing on author error). Returns `[]` when there are none.
 */
export function extractFsDirectives(markdown: string): FsDirective[] {
  const out: FsDirective[] = []
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const open = FS_FENCE_OPEN.exec(lines[i]!)
    if (!open) continue
    const type = open[1]!
    const body: string[] = []
    let j = i + 1
    for (; j < lines.length; j++) {
      if (FENCE_CLOSE.test(lines[j]!)) break
      body.push(lines[j]!)
    }
    i = j // resume after the closing fence (or EOF)
    const parsed = parseFsBody(type, body.join('\n'))
    if (parsed) out.push(parsed)
  }
  return out
}

/**
 * Parse one fence body for a known `fs:` type. Back-fills `type` from the
 * info-string. Returns null on any malformed body so callers can fall back to
 * rendering the raw fence.
 */
export function parseFsBody(type: string, body: string): FsDirective | null {
  const trimmed = body.trim()
  if (!trimmed) return null
  let value: unknown
  try {
    value = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  // Back-fill `type` from the info-string, overriding any body value so the
  // fence label is authoritative.
  const config: Record<string, unknown> = { ...(value as Record<string, unknown>), type }
  return { type, config }
}
