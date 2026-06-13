/**
 * JSON-tree section surgery — the structured-config counterpart to
 * `yamlSections`.
 *
 * Legacy stories store their section config as YAML and the canvas edits it by
 * splicing the raw string (so comments and coordinate tables survive). JSON
 * configs have no comments to preserve, so the model is simpler and cleaner:
 * parse the document, operate on the section array, re-serialise. Every helper
 * here takes and returns a JSON config *string* so the call sites mirror the
 * YAML ones — the parse/stringify round-trip is the whole point.
 *
 * Indentation is two-space, trailing-newline'd, so a diff against the previous
 * write stays minimal and the file reads cleanly in a PR.
 */

export interface JsonConfigSection {
  id?: string
  text?: string
  kind?: string
  [key: string]: unknown
}

export interface JsonConfigModel {
  defaults: Record<string, unknown>
  sections: JsonConfigSection[]
  /** Other top-level keys are preserved verbatim through a round-trip. */
  rest: Record<string, unknown>
  /** Non-null when the document failed to parse — callers fall back to raw. */
  parseError: string | null
}

/** Parse a JSON config document into an editable model. An empty/blank string
 *  is a valid "no config yet" base — it yields empty defaults + sections. */
export function parseJsonConfig(raw: string): JsonConfigModel {
  const empty: JsonConfigModel = { defaults: {}, sections: [], rest: {}, parseError: null }
  const trimmed = raw.trim()
  if (!trimmed) return empty
  let obj: unknown
  try {
    obj = JSON.parse(trimmed)
  } catch (e) {
    return { ...empty, parseError: e instanceof Error ? e.message : String(e) }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ...empty, parseError: 'config JSON must be an object' }
  }
  const { defaults, sections, ...rest } = obj as Record<string, unknown>
  return {
    defaults: (defaults as Record<string, unknown>) ?? {},
    sections: Array.isArray(sections) ? (sections as JsonConfigSection[]) : [],
    rest,
    parseError: null,
  }
}

/** Serialise a model (or a raw config object) back to a JSON config string. */
export function stringifyJsonConfig(
  model: Pick<JsonConfigModel, 'defaults' | 'sections'> & { rest?: Record<string, unknown> },
): string {
  const out = { defaults: model.defaults, ...(model.rest ?? {}), sections: model.sections }
  return JSON.stringify(out, null, 2) + '\n'
}

/** Append a section entry to a JSON config's `sections` array. */
export function appendJsonSection(configJson: string, entry: JsonConfigSection): string {
  const model = parseJsonConfig(configJson)
  if (model.parseError) {
    throw new Error(`cannot append section to invalid config JSON: ${model.parseError}`)
  }
  model.sections.push(entry)
  return stringifyJsonConfig(model)
}

/** The markdown anchor a section's prose lives under — its config `text`.
 *  Null when the entry has none (a subsections parent) or the id is unknown. */
export function jsonSectionAnchor(configJson: string, sectionId: string): string | null {
  const model = parseJsonConfig(configJson)
  if (model.parseError) return null
  return model.sections.find((s) => s.id === sectionId)?.text ?? null
}

/** Replace a section's visual `body` keyed by id, preserving id/text/kind. */
export function replaceJsonSectionBody(
  configJson: string,
  sectionId: string,
  body: Record<string, unknown>,
): string {
  const model = parseJsonConfig(configJson)
  if (model.parseError) throw new Error(`invalid config JSON: ${model.parseError}`)
  const index = model.sections.findIndex((s) => s.id === sectionId)
  if (index < 0) throw new Error(`section "${sectionId}" not found in config`)
  const existing = model.sections[index]!
  const entry: JsonConfigSection = { id: existing.id }
  if (existing.text) entry.text = existing.text
  if (existing.kind) entry.kind = existing.kind
  for (const [k, v] of Object.entries(body)) {
    if (k !== 'id' && k !== 'text') entry[k] = v
  }
  model.sections[index] = entry
  return stringifyJsonConfig(model)
}

/** Replace a whole section entry by index (canvas edit-in-place). */
export function replaceJsonSection(
  configJson: string,
  index: number,
  entry: JsonConfigSection,
): string {
  const model = parseJsonConfig(configJson)
  if (model.parseError) throw new Error(`invalid config JSON: ${model.parseError}`)
  if (index < 0 || index >= model.sections.length) {
    throw new Error(`section index ${index} out of range`)
  }
  model.sections[index] = entry
  return stringifyJsonConfig(model)
}

/** Duplicate the section at `index`, inserting the copy immediately after it. */
export function duplicateJsonSection(configJson: string, index: number): string {
  const model = parseJsonConfig(configJson)
  if (model.parseError) throw new Error(`invalid config JSON: ${model.parseError}`)
  const src = model.sections[index]
  if (!src) throw new Error(`section index ${index} out of range`)
  const existingIds = model.sections
    .map((s) => s.id)
    .filter((id): id is string => typeof id === 'string')
  const copy: JsonConfigSection = JSON.parse(JSON.stringify(src))
  if (typeof src.id === 'string') copy.id = dedupeId(src.id, existingIds)
  model.sections.splice(index + 1, 0, copy)
  return stringifyJsonConfig(model)
}

/** Move the section at `from` to `to` (clamped), preserving the others' order. */
export function moveJsonSection(configJson: string, from: number, to: number): string {
  const model = parseJsonConfig(configJson)
  if (model.parseError) throw new Error(`invalid config JSON: ${model.parseError}`)
  const n = model.sections.length
  if (from < 0 || from >= n) throw new Error(`section index ${from} out of range`)
  const dest = Math.max(0, Math.min(to, n - 1))
  const [moved] = model.sections.splice(from, 1)
  model.sections.splice(dest, 0, moved!)
  return stringifyJsonConfig(model)
}

/** Delete the section at `index`. */
export function deleteJsonSection(configJson: string, index: number): string {
  const model = parseJsonConfig(configJson)
  if (model.parseError) throw new Error(`invalid config JSON: ${model.parseError}`)
  if (index < 0 || index >= model.sections.length) {
    throw new Error(`section index ${index} out of range`)
  }
  model.sections.splice(index, 1)
  return stringifyJsonConfig(model)
}

/** kebab base + `-2`, `-3`… until unique against `taken`. */
function dedupeId(base: string, taken: string[]): string {
  const set = new Set(taken)
  if (!set.has(base)) return base
  let n = 2
  while (set.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}
