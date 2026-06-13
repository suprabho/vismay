import { stringify as yamlStringify } from 'yaml'
import matter from 'gray-matter'
import {
  isAllowedTextModel,
  DEFAULT_TEXT_MODEL,
  packForVertical,
  type DomainPack,
  type SourceDoc,
} from '@vismay/story-pipeline'
import { createServiceClient } from '@vismay/content-source/supabase'
import { buildYamlModel, replaceSection } from '@vismay/content-source/yamlSections'
import { jsonSectionAnchor, replaceJsonSectionBody } from '@vismay/content-source/jsonSections'
import {
  getContentSource,
  verticalForApp,
  type ConfigFormat,
} from '@vismay/content-source/contentSource'
import type { StorySource } from '@vismay/content-source/storySources'

/** Shared helpers for the canvas compose routes (sources / angles / outline / section). */

/**
 * Resolve the story's editorial desk (DomainPack) — voice + vertical layer
 * menu for every compose generation pass.
 *
 *   1. frontmatter `vertical` (Tier 1 seeds it on per-app drafts; read via
 *      raw markdown + gray-matter so drafts resolve too),
 *   2. else the stories-row appSlug → verticalForApp (covers stories assigned
 *      to an app before the vertical seeding existed),
 *   3. else the vizmaya desk.
 */
export async function resolveStoryPack(slug: string): Promise<DomainPack> {
  const src = getContentSource()
  try {
    const md = await src.readMarkdown(slug)
    if (md) {
      const vertical = (matter(md).data as Record<string, unknown>).vertical
      if (typeof vertical === 'string' && vertical) return packForVertical(vertical)
    }
  } catch {
    // fall through to the app-slug mapping
  }
  try {
    const row = (await src.listStories()).find((s) => s.slug === slug)
    const vertical = verticalForApp(row?.appSlug)
    if (vertical) return packForVertical(vertical)
  } catch {
    // fall through to the default desk
  }
  return packForVertical(null)
}

/**
 * Pre-resolve the data a pack's `hydrate` step needs (the pipeline does no I/O).
 *
 * For the F1 desk: a `code`/`driver_id → headshot_url` map from `vizf1_drivers`
 * (same shared Supabase project), so generated standings render driver photos.
 * Keyed by BOTH the 3-letter code and the slug because the model's `driverId`
 * (from the display name) need not match OpenF1's `slug(first_last)`. Team
 * colours are static (handled inside the pack), so only photos need a lookup.
 *
 * Best-effort: any failure (no rows, query error, env) returns undefined and
 * the table falls back to the team-coloured monogram chip — never blocks compose.
 */
export async function resolveHydrationDeps(
  pack: DomainPack,
): Promise<Record<string, unknown> | undefined> {
  if (pack.id !== 'f1') return undefined
  try {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('vizf1_drivers')
      .select('driver_id, code, headshot_url')
      .not('headshot_url', 'is', null)
    if (error || !data) return undefined
    const headshots: Record<string, string> = {}
    for (const d of data as Array<{
      driver_id: string
      code: string | null
      headshot_url: string | null
    }>) {
      if (!d.headshot_url) continue
      if (d.code) headshots[d.code.toUpperCase()] = d.headshot_url
      headshots[d.driver_id] = d.headshot_url
    }
    return Object.keys(headshots).length > 0 ? { f1DriverHeadshots: headshots } : undefined
  } catch {
    return undefined
  }
}

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

// Section anchors are level-1 OR level-2 headings (a hero anchors at the
// document `# H1`; everything else at `## H2`) — mirror contentAnchors.
const HEADING_RE = /^##?\s+/

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

/** Replace the prose under a `## heading` block (CONTENT pass writes markdown).
 *  Preserves the existing anchor level — a hero's `# H1` stays an H1. */
export function replaceMarkdownProse(markdown: string, heading: string, paragraphs: string[]): string {
  const lines = markdown.split('\n')
  const span = sectionSpan(lines, heading)
  if (!span) return markdown
  const hashes = lines[span[0]]!.match(/^#+/)?.[0] ?? '##'
  const body = paragraphs.map((p) => p.trim()).filter(Boolean).join('\n\n')
  const block = [`${hashes} ${heading.trim()}`, '', body, '']
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

/** The markdown anchor a section's prose lives under — the config entry's
 *  `text` field. Falls back to null when the entry has none (subsections
 *  parent) or the id is unknown. Needed because a deck cover anchors at
 *  `## Cover` while its outline entry keeps the display title as `heading`. */
export function sectionAnchor(
  configText: string,
  sectionId: string,
  format: ConfigFormat = 'yaml',
): string | null {
  if (format === 'json') return jsonSectionAnchor(configText, sectionId)
  const model = buildYamlModel(configText)
  if (model.parseError) return null
  const s = model.sections.find((x) => x.id === sectionId)
  return s?.text ?? null
}

/** Replace a section's visual `body` in the config, keyed by id, preserving its
 *  id/text/kind (VISUAL pass writes the config). JSON-native stories edit the
 *  parsed tree; YAML stories splice the raw string to keep comments. */
export function replaceConfigBody(
  configText: string,
  sectionId: string,
  body: Record<string, unknown>,
  format: ConfigFormat = 'yaml',
): string {
  if (format === 'json') return replaceJsonSectionBody(configText, sectionId, body)
  const configYaml = configText
  const model = buildYamlModel(configYaml)
  if (model.parseError) throw new Error(`invalid config YAML: ${model.parseError}`)
  const index = model.sections.findIndex((s) => s.id === sectionId)
  if (index < 0) throw new Error(`section "${sectionId}" not found in config`)
  const existing = model.sections[index]!
  // A subsections parent has no `text` anchor of its own — don't write one back.
  const entry: Record<string, unknown> = { id: existing.id }
  if (existing.text) entry.text = existing.text
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
