import { stringify as stringifyYaml } from 'yaml'
import { buildYamlModel } from './yamlSections'

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

/** Append a `## heading` + prose block to the end of a markdown body. */
export function appendSectionToMarkdown(
  markdown: string,
  heading: string,
  paragraphs: string[],
): string {
  const body = paragraphs
    .map((p) => p.trim())
    .filter(Boolean)
    .join('\n\n')
  const block = `## ${heading}\n\n${body}\n`
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
  configYaml: string,
  section: NewSection,
): AppendSectionResult {
  const heading = section.heading.trim()
  if (!heading) throw new Error('section heading is required')

  const existing = buildYamlModel(configYaml)
  if (existing.parseError) {
    throw new Error(`cannot append section to invalid config YAML: ${existing.parseError}`)
  }
  const existingIds = existing.sections
    .map((s) => s.id)
    .filter((id): id is string => !!id)
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
  // at); a flat section writes its own single block as before.
  let md = markdown
  if (subs.length) {
    for (const s of subs) md = appendSectionToMarkdown(md, s.heading.trim(), s.paragraphs)
  } else {
    md = appendSectionToMarkdown(md, heading, section.paragraphs)
  }

  return {
    markdown: md,
    configYaml: appendSectionToConfig(configYaml, entry),
    id,
  }
}
