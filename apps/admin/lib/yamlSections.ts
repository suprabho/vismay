import { parse as parseYaml } from 'yaml'

/**
 * Line-based helpers for the admin YAML cards view.
 *
 * Design choice (plan § YAML cards, option b): we parse the YAML for
 * *display* (card headers pull `id`, `kind`, `text` from the parsed tree) but
 * perform structural edits — duplicate, move, delete, edit-in-place — by
 * splicing the raw string. That way comments, coordinate tables, and section
 * separators survive every structural op.
 */

export interface SectionBlock {
  /** 0-based start line (inclusive) of the `  - id: …` line. */
  startLine: number
  /** 0-based end line (exclusive). */
  endLine: number
  /** Raw text of the block — the `  - …` section item including nested keys. */
  raw: string
  /** Extracted id/kind/text from YAML parse, for card header display. */
  id: string | null
  kind: string | null
  text: string | null
  /** Index in the original `sections:` array. */
  index: number
}

export interface YamlModel {
  /** The unparsed YAML document. Always the source of truth. */
  raw: string
  /** Null if the document fails to parse. */
  parseError: string | null
  /** Top-level `defaults:` block as a substring (or null). */
  defaults: { startLine: number; endLine: number; raw: string } | null
  sections: SectionBlock[]
  /** Line where the `sections:` key appears, or -1. */
  sectionsHeaderLine: number
  /** Line immediately after the last section in the raw string (for appends). */
  sectionsEndLine: number
}

const SECTION_START_RE = /^  -\s/
const TOP_KEY_RE = /^[a-zA-Z_][\w-]*:\s*(?:#.*)?$/
const SECTIONS_HEADER_RE = /^sections:\s*(?:#.*)?$/
const DEFAULTS_HEADER_RE = /^defaults:\s*(?:#.*)?$/

/**
 * Parse a config YAML document into a structural model the editor can show as cards.
 * When YAML is invalid, sections is empty and parseError is set — the caller
 * falls back to the raw textarea.
 */
export function buildYamlModel(raw: string): YamlModel {
  const lines = raw.split('\n')
  const model: YamlModel = {
    raw,
    parseError: null,
    defaults: null,
    sections: [],
    sectionsHeaderLine: -1,
    sectionsEndLine: lines.length,
  }

  // Locate top-level blocks by scanning for column-0 keys.
  const topKeyLines: { line: number; key: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    if (TOP_KEY_RE.test(lines[i])) {
      topKeyLines.push({ line: i, key: lines[i].split(':')[0] })
    }
  }

  // Defaults block: from `defaults:` to the next top-level key.
  const defaultsIdx = topKeyLines.findIndex((t) => DEFAULTS_HEADER_RE.test(lines[t.line]))
  if (defaultsIdx >= 0) {
    const start = topKeyLines[defaultsIdx].line
    const end = topKeyLines[defaultsIdx + 1]?.line ?? lines.length
    model.defaults = {
      startLine: start,
      endLine: end,
      raw: lines.slice(start, end).join('\n'),
    }
  }

  // Sections block boundaries.
  const sectionsIdx = topKeyLines.findIndex((t) => SECTIONS_HEADER_RE.test(lines[t.line]))
  if (sectionsIdx < 0) {
    // No sections block — still try to parse for the defaults-only case.
    safeParseAndFill(raw, model)
    return model
  }
  model.sectionsHeaderLine = topKeyLines[sectionsIdx].line
  const sectionsBlockEnd = topKeyLines[sectionsIdx + 1]?.line ?? lines.length
  model.sectionsEndLine = sectionsBlockEnd

  // Section item starts: lines matching `^  -\s` within the sections block.
  const starts: number[] = []
  for (let i = model.sectionsHeaderLine + 1; i < sectionsBlockEnd; i++) {
    if (SECTION_START_RE.test(lines[i])) starts.push(i)
  }

  safeParseAndFill(raw, model)

  // Extend start backwards to absorb leading comments (lines that begin with
  // "  #" at indent 2) so duplicate/move carries a section's header banner.
  const extendedStarts = starts.map((startLine) => {
    let s = startLine
    while (s > model.sectionsHeaderLine + 1) {
      const prev = lines[s - 1]
      if (/^  #/.test(prev) || /^\s*$/.test(prev)) s--
      else break
    }
    return { realStart: startLine, absorbedStart: s }
  })

  // Build SectionBlocks with boundaries.
  const parsedSections = tryParseSections(raw)
  model.sections = extendedStarts.map((e, idx) => {
    const nextStart = extendedStarts[idx + 1]?.absorbedStart ?? sectionsBlockEnd
    const ps = parsedSections?.[idx] ?? null
    return {
      startLine: e.absorbedStart,
      endLine: nextStart,
      raw: lines.slice(e.absorbedStart, nextStart).join('\n'),
      id: (ps?.id as string | undefined) ?? null,
      kind: (ps?.kind as string | undefined) ?? null,
      text: pickText(ps),
      index: idx,
    }
  })

  return model
}

function safeParseAndFill(raw: string, model: YamlModel) {
  try {
    const doc = parseYaml(raw)
    if (doc == null || typeof doc !== 'object') return
  } catch (e) {
    model.parseError = e instanceof Error ? e.message : 'invalid YAML'
  }
}

function tryParseSections(raw: string): Record<string, unknown>[] | null {
  try {
    const doc = parseYaml(raw) as { sections?: unknown }
    if (Array.isArray(doc?.sections)) return doc.sections as Record<string, unknown>[]
  } catch {
    /* fallthrough — sections will render as empty */
  }
  return null
}

function pickText(section: Record<string, unknown> | null): string | null {
  if (!section) return null
  if (typeof section.text === 'string') return section.text
  const subs = section.subsections as Array<{ text?: unknown }> | undefined
  if (Array.isArray(subs)) {
    const first = subs.find((s) => typeof s?.text === 'string')
    if (first && typeof first.text === 'string') return first.text
  }
  return null
}

/** Replace the lines of a section block with new content. */
export function replaceSection(model: YamlModel, index: number, newRaw: string): string {
  const lines = model.raw.split('\n')
  const section = model.sections[index]
  if (!section) throw new Error(`no section at index ${index}`)
  const before = lines.slice(0, section.startLine)
  const after = lines.slice(section.endLine)
  return [...before, ...splitPreservingTrailingNewline(newRaw), ...after].join('\n')
}

/** Duplicate a section immediately after its current position. */
export function duplicateSection(model: YamlModel, index: number): string {
  const section = model.sections[index]
  if (!section) return model.raw
  const lines = model.raw.split('\n')
  const inserted = splitPreservingTrailingNewline(section.raw)
  return [
    ...lines.slice(0, section.endLine),
    ...inserted,
    ...lines.slice(section.endLine),
  ].join('\n')
}

/** Delete a section's lines. */
export function deleteSection(model: YamlModel, index: number): string {
  const section = model.sections[index]
  if (!section) return model.raw
  const lines = model.raw.split('\n')
  return [...lines.slice(0, section.startLine), ...lines.slice(section.endLine)].join('\n')
}

/** Swap adjacent sections (move up = swap with previous). */
export function moveSection(model: YamlModel, index: number, direction: 'up' | 'down'): string {
  if (direction === 'up' && index === 0) return model.raw
  if (direction === 'down' && index === model.sections.length - 1) return model.raw
  const a = direction === 'up' ? model.sections[index - 1] : model.sections[index]
  const b = direction === 'up' ? model.sections[index] : model.sections[index + 1]
  const lines = model.raw.split('\n')
  const before = lines.slice(0, a.startLine)
  const aLines = lines.slice(a.startLine, a.endLine)
  const between = lines.slice(a.endLine, b.startLine)
  const bLines = lines.slice(b.startLine, b.endLine)
  const after = lines.slice(b.endLine)
  return [...before, ...bLines, ...between, ...aLines, ...after].join('\n')
}

function splitPreservingTrailingNewline(text: string): string[] {
  // `raw` of a section block was built via `lines.slice().join('\n')` so it has
  // no trailing newline. Splitting and splicing roundtrips cleanly.
  return text.split('\n')
}
