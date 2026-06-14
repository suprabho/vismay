import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { buildYamlModel } from './yamlSections'
import {
  parseJsonConfig,
  appendJsonSection,
  stringifyJsonConfig,
  type JsonConfigSection,
} from './jsonSections'
import type { ConfigFormat } from './contentSource'

/**
 * Insert a brand-new section into a story's paired files (markdown + config.yaml).
 *
 * A Vizmaya section is two halves linked by a text anchor: a `## Heading` +
 * prose in the markdown, and a `sections[]` entry in config.yaml whose `text`
 * field matches the heading exactly. There is no add-section flow elsewhere —
 * the canvas only adds layers/regions/overrides to existing sections — so this
 * is the first primitive that creates a whole section. It is the file-surgery
 * foundation the AI section generator writes through.
 *
 * Pure string surgery (no I/O): the config edit reuses `yamlSections`'
 * line-based model so existing comments/banners survive, and the new entry is
 * serialised and appended after the last section. The heading and the config
 * `text` are written from the SAME string, so the anchor always matches.
 */

export interface NewSection {
  /** Becomes both the `## Heading` and the config `text` anchor. */
  heading: string
  /** Markdown body — one string per paragraph. */
  paragraphs: string[]
  /** Optional section kind (text | hero | stat | cover | bigStat | …). */
  kind?: string
  /** The rest of the config entry (foreground / background / map / layout / …).
   *  `id` and `text` are set by this function and must not be supplied here. */
  body?: Record<string, unknown>
  /**
   * MAP sub-beats. When present, the engine ignores the parent's own prose —
   * so the parent gets NO markdown block and NO config `text`; instead each
   * subsection gets its own `## heading` + prose in the markdown and a
   * `{ text, map }` entry in the config's `subsections:` list. The heading
   * still names the parent (drives the section id).
   */
  subsections?: Array<{
    heading: string
    paragraphs: string[]
    /** Partial map override (center/zoom/pitch/bearing/pins) for this beat. */
    map?: Record<string, unknown>
  }>
}

export interface AppendSectionResult {
  markdown: string
  configYaml: string
  /** The generated, de-duplicated section id. */
  id: string
}

/** Slugify a heading into a unique section id (kebab-case, deduped). */
export function makeSectionId(heading: string, existingIds: string[]): string {
  const base =
    heading
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'section'
  const taken = new Set(existingIds)
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/** Append a `## heading` + prose block to the end of a markdown body.
 *  `level: 1` writes the document-title `# heading` instead (hero sections —
 *  the loader anchors heading levels 1 and 2 alike). */
export function appendSectionToMarkdown(
  markdown: string,
  heading: string,
  paragraphs: string[],
  level: 1 | 2 = 2,
): string {
  const body = paragraphs
    .map((p) => p.trim())
    .filter(Boolean)
    .join('\n\n')
  const block = `${'#'.repeat(level)} ${heading}\n\n${body}\n`
  const base = markdown.replace(/\s+$/, '')
  return base ? `${base}\n\n${block}` : block
}

/** Serialise a section entry object as a `  - …` YAML list item (4-space nested). */
function toSectionListItem(entry: Record<string, unknown>): string[] {
  // stringify([entry]) yields a 0-indent list item ("- id: …\n  text: …");
  // indenting every line by two spaces lands it at the sections-array indent.
  return stringifyYaml([entry], { lineWidth: 0 })
    .replace(/\s+$/, '')
    .split('\n')
    .map((l) => `  ${l}`)
}

/** Append a serialised section entry to the `sections:` array of a config YAML. */
export function appendSectionToConfig(
  configYaml: string,
  entry: Record<string, unknown>,
): string {
  const model = buildYamlModel(configYaml)
  if (model.parseError) {
    throw new Error(`cannot append section to invalid config YAML: ${model.parseError}`)
  }
  const item = toSectionListItem(entry)

  // No `sections:` key yet — create the block at the end of the document.
  if (model.sectionsHeaderLine === -1) {
    const sep = configYaml.endsWith('\n') || configYaml === '' ? '' : '\n'
    return `${configYaml}${sep}sections:\n${item.join('\n')}\n`
  }

  // Insert after the last existing section (a blank line keeps sections legible).
  const lines = configYaml.split('\n')
  const at = model.sectionsEndLine
  return [...lines.slice(0, at), '', ...item, ...lines.slice(at)].join('\n')
}

/**
 * Append a complete new section to a story. Returns the new markdown + config
 * and the generated id. `id`/`text` on the entry are derived here — the heading
 * drives both so the markdown anchor and the config `text` can never diverge.
 */
export function appendStorySection(
  markdown: string,
  configText: string,
  section: NewSection,
  format: ConfigFormat = 'yaml',
): AppendSectionResult {
  const heading = section.heading.trim()
  if (!heading) throw new Error('section heading is required')

  const existingIds = collectExistingIds(configText, format)
  const id = makeSectionId(heading, existingIds)

  const subs = section.subsections?.filter((s) => s.heading.trim()) ?? []

  // A parent with subsections carries no anchor of its own — the engine ignores
  // parent prose when `subsections` is present, so writing a `text:` would only
  // point at a heading that never renders.
  const entry: Record<string, unknown> = subs.length ? { id } : { id, text: heading }
  if (section.kind) entry.kind = section.kind
  if (section.body) {
    for (const [k, v] of Object.entries(section.body)) {
      if (k === 'id' || k === 'text') continue // never let the body override these
      entry[k] = v
    }
  }
  if (subs.length) {
    entry.subsections = subs.map((s) => ({
      text: s.heading.trim(),
      ...(s.map && Object.keys(s.map).length ? { map: s.map } : {}),
    }))
  }

  // Markdown: one `## heading` block per beat (the anchors the config points
  // at); a flat section writes its own single block as before. A hero is the
  // story's title block, so its anchor is the document H1 (`# heading`).
  let md = markdown
  if (subs.length) {
    for (const s of subs) md = appendSectionToMarkdown(md, s.heading.trim(), s.paragraphs)
  } else {
    md = appendSectionToMarkdown(md, heading, section.paragraphs, section.kind === 'hero' ? 1 : 2)
  }

  // The config half is format-specific — YAML string surgery (preserve
  // comments) vs JSON tree push — but the entry it appends is identical.
  const configOut =
    format === 'json'
      ? appendJsonSection(configText, entry as JsonConfigSection)
      : appendSectionToConfig(configText, entry)

  return { markdown: md, configYaml: configOut, id }
}

/**
 * Append one or more foreground layers into an EXISTING section's `foreground`,
 * keyed by the section's array index. This is the "node-level" counterpart to
 * `appendStorySection`: instead of tacking a whole new section onto the end of
 * the story, it drops a layer (e.g. a real `fs:standings-table` block picked
 * from the football data modal) into the section the user is already editing.
 *
 * The layers carry their own absolute `style` (free-layout positioning), so the
 * only valid host is a flat `foreground` ARRAY. We therefore:
 *   - create the array (and stamp `layout: free`) when the section has none,
 *   - push onto an existing array,
 *   - coerce a lone bare-object foreground into a two-item array,
 *   - and REFUSE a `{ regions: … }` foreground (deck layout has no flat slot for
 *     a self-positioned layer) — the caller falls back to a new section.
 *
 * Format-aware like `appendStorySection`: a JSON-native config (footshorts/f1)
 * round-trips through the JSON model; YAML round-trips through parse/stringify
 * (text-level comments are lost, same tradeoff `replaceLayer` already accepts).
 */
export type AppendLayerResult =
  | { ok: true; configText: string }
  | { ok: false; reason: 'no-section' | 'regions-layout' | 'no-layers' }

export function appendSectionForegroundLayers(
  configText: string,
  sectionIndex: number,
  layers: Array<Record<string, unknown>>,
  format: ConfigFormat = 'yaml',
): AppendLayerResult {
  if (!layers.length) return { ok: false, reason: 'no-layers' }

  if (format === 'json') {
    const model = parseJsonConfig(configText)
    if (model.parseError) {
      throw new Error(`cannot edit invalid config JSON: ${model.parseError}`)
    }
    const section = model.sections[sectionIndex]
    if (!section || typeof section !== 'object') return { ok: false, reason: 'no-section' }
    if (!pushForegroundLayers(section as Record<string, unknown>, layers)) {
      return { ok: false, reason: 'regions-layout' }
    }
    return { ok: true, configText: stringifyJsonConfig(model) }
  }

  let doc: unknown
  try {
    doc = parseYaml(configText || '')
  } catch (e) {
    throw new Error(`cannot edit invalid config YAML: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!doc || typeof doc !== 'object' || !Array.isArray((doc as { sections?: unknown }).sections)) {
    return { ok: false, reason: 'no-section' }
  }
  const sections = (doc as { sections: unknown[] }).sections
  const section = sections[sectionIndex]
  if (!section || typeof section !== 'object') return { ok: false, reason: 'no-section' }
  if (!pushForegroundLayers(section as Record<string, unknown>, layers)) {
    return { ok: false, reason: 'regions-layout' }
  }
  return { ok: true, configText: stringifyYaml(doc, { lineWidth: 0 }) }
}

/**
 * Mutate `section.foreground` to include `layers`. Returns false (no mutation)
 * when the existing foreground is a `{ regions: … }` object — a deck layout
 * has no flat slot for a self-positioned layer.
 */
function pushForegroundLayers(
  section: Record<string, unknown>,
  layers: Array<Record<string, unknown>>,
): boolean {
  const fg = section.foreground
  if (fg == null) {
    section.foreground = [...layers]
    // A self-positioned layer needs free layout; only stamp it when the
    // section hasn't already declared one (don't clobber an explicit layout).
    if (section.layout == null) section.layout = 'free'
    return true
  }
  if (Array.isArray(fg)) {
    section.foreground = [...fg, ...layers]
    return true
  }
  if (typeof fg === 'object') {
    if ('regions' in (fg as Record<string, unknown>)) return false
    // A lone bare layer object — fold it into an array alongside the new ones.
    section.foreground = [fg, ...layers]
    return true
  }
  return false
}

/** The ids already taken in a config, so a new section's id can dedupe against
 *  them — read through the format's own parser. */
function collectExistingIds(configText: string, format: ConfigFormat): string[] {
  if (format === 'json') {
    const model = parseJsonConfig(configText)
    if (model.parseError) {
      throw new Error(`cannot append section to invalid config JSON: ${model.parseError}`)
    }
    return model.sections.map((s) => s.id).filter((id): id is string => !!id)
  }
  const model = buildYamlModel(configText)
  if (model.parseError) {
    throw new Error(`cannot append section to invalid config YAML: ${model.parseError}`)
  }
  return model.sections.map((s) => s.id).filter((id): id is string => !!id)
}
