import { stringify as yamlStringify } from 'yaml'
import { isAllowedTextModel, DEFAULT_TEXT_MODEL, type SourceDoc } from '@vismay/story-pipeline'
import { buildYamlModel, replaceSection } from '@vismay/content-source/yamlSections'
import type { StorySource } from '@vismay/content-source/storySources'

/** Shared helpers for the canvas compose routes (sources / angles / outline / section). */

/** Resolve a text-model alias from request input, then a stored fallback. */
export function resolveModel(input: unknown, fallback?: string | null): string {
  if (typeof input === 'string' && isAllowedTextModel(input)) return input
  if (typeof fallback === 'string' && isAllowedTextModel(fallback)) return fallback
  return DEFAULT_TEXT_MODEL
}

/** Map persisted `story_sources` rows to the pipeline's `SourceDoc` shape,
 *  keeping only successfully-extracted sources. */
export function sourcesToDocs(rows: StorySource[]): SourceDoc[] {
  return rows
    .filter((r) => r.status === 'extracted' && !!r.extractedText)
    .map((r) => ({
      origin: r.sourceUrl ?? r.filename ?? r.title ?? r.id,
      kind: r.kind,
      title: r.title ?? r.filename ?? 'Untitled',
      byline: r.byline ?? undefined,
      body: r.extractedText ?? '',
    }))
}

// ── In-place section surgery (for the per-section CONTENT/VISUAL passes) ────

const HEADING_RE = /^##\s+/

function sectionSpan(lines: string[], heading: string): [number, number] | null {
  const h = heading.trim()
  const start = lines.findIndex((l) => HEADING_RE.test(l) && l.replace(HEADING_RE, '').trim() === h)
  if (start < 0) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (HEADING_RE.test(lines[i]!)) {
      end = i
      break
    }
  }
  return [start, end]
}

/** Replace the prose under a `## heading` block (CONTENT pass writes markdown). */
export function replaceMarkdownProse(markdown: string, heading: string, paragraphs: string[]): string {
  const lines = markdown.split('\n')
  const span = sectionSpan(lines, heading)
  if (!span) return markdown
  const body = paragraphs.map((p) => p.trim()).filter(Boolean).join('\n\n')
  const block = [`## ${heading.trim()}`, '', body, '']
  return [...lines.slice(0, span[0]), ...block, ...lines.slice(span[1])].join('\n')
}

/** Read the current prose under a `## heading` (grounds the VISUAL pass). */
export function readMarkdownProse(markdown: string, heading: string): string[] {
  const lines = markdown.split('\n')
  const span = sectionSpan(lines, heading)
  if (!span) return []
  return lines
    .slice(span[0] + 1, span[1])
    .join('\n')
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Replace a section's visual `body` in the config, keyed by id, preserving its
 *  id/text/kind (VISUAL pass writes config.yaml). */
export function replaceConfigBody(
  configYaml: string,
  sectionId: string,
  body: Record<string, unknown>,
): string {
  const model = buildYamlModel(configYaml)
  if (model.parseError) throw new Error(`invalid config YAML: ${model.parseError}`)
  const index = model.sections.findIndex((s) => s.id === sectionId)
  if (index < 0) throw new Error(`section "${sectionId}" not found in config`)
  const existing = model.sections[index]!
  const entry: Record<string, unknown> = { id: existing.id, text: existing.text }
  if (existing.kind) entry.kind = existing.kind
  for (const [k, v] of Object.entries(body)) {
    if (k !== 'id' && k !== 'text') entry[k] = v
  }
  const raw = yamlStringify([entry], { lineWidth: 0 })
    .replace(/\s+$/, '')
    .split('\n')
    .map((l) => `  ${l}`)
    .join('\n')
  return replaceSection(model, index, raw)
}
