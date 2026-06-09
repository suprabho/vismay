import { getVizModule, getForegroundLayout } from './vizEngine'
import { sectionKindsFor } from './schema'
import type { GeneratedStory, GeneratedSection, ValidationIssue } from './types'

/** A foreground layer is any object with a string `type`. */
function isLayer(v: unknown): v is { type: string; [k: string]: unknown } {
  return !!v && typeof v === 'object' && typeof (v as { type?: unknown }).type === 'string'
}

/**
 * Walk a normalised section `body` and yield every foreground/background layer
 * plus the layout name. `normalizeSectionBody` can produce a single layer, a
 * flat array, or `{ layout?, regions: { name: layers[] } }`.
 */
function collectLayers(body: Record<string, unknown>): {
  layers: Array<{ type: string; [k: string]: unknown }>
  layout?: string
  regionNames: string[]
} {
  const layers: Array<{ type: string; [k: string]: unknown }> = []
  const regionNames: string[] = []
  let layout: string | undefined

  const fg = body.foreground
  if (Array.isArray(fg)) {
    for (const l of fg) if (isLayer(l)) layers.push(l)
  } else if (isLayer(fg)) {
    layers.push(fg)
  } else if (fg && typeof fg === 'object') {
    const obj = fg as { layout?: unknown; regions?: unknown }
    if (typeof obj.layout === 'string') layout = obj.layout
    if (obj.regions && typeof obj.regions === 'object') {
      for (const [name, arr] of Object.entries(obj.regions as Record<string, unknown>)) {
        regionNames.push(name)
        if (Array.isArray(arr)) for (const l of arr) if (isLayer(l)) layers.push(l)
        else if (isLayer(arr)) layers.push(arr)
      }
    }
  }

  // Background can carry a renderable layer too (map); `{ type: 'none' }` is inert.
  const bg = body.background
  if (isLayer(bg) && bg.type !== 'none') layers.push(bg)

  return { layers, layout, regionNames }
}

/**
 * Validate a generated story against viz-engine's real schemas before it's
 * written. Each foreground layer is re-parsed through its module's `parseConfig`
 * (the same validation the renderer runs), layout names are checked against the
 * registry, and chart layers are cross-referenced to the emitted chart specs.
 * Returns a flat issue list (empty = valid).
 */
export function validateStory(story: GeneratedStory): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (story.sections.length === 0) {
    issues.push({ message: 'story has no sections' })
    return issues
  }

  const chartIds = new Set(story.charts.map((c) => c.id))
  const seenHeadings = new Set<string>()

  for (const section of story.sections) {
    const label = section.heading || '(untitled section)'
    if (!section.heading?.trim()) {
      issues.push({ section: label, message: 'section heading is empty' })
    } else if (seenHeadings.has(section.heading)) {
      issues.push({ section: label, message: 'duplicate section heading' })
    } else {
      seenHeadings.add(section.heading)
    }

    // MAP prose-rail guard: a map section renders its prose in the scroll rail.
    // The renderer suppresses that rail two ways — a deck `kind`, OR a regions/
    // panel `foreground` (`usesRegions`) — and on a map section the prose then
    // renders nowhere. Schema/prompt steer the generator away from both; this is
    // the hard backstop for drift and hand-edited configs.
    if (story.format === 'map' && !sectionKindsFor('map').includes(section.kind)) {
      issues.push({
        section: label,
        message: `kind "${section.kind}" suppresses the map prose rail — use ${sectionKindsFor('map').join(' / ')}`,
      })
    }

    validateSectionLayers(story, section, label, chartIds, issues)
  }

  return issues
}

function validateSectionLayers(
  story: GeneratedStory,
  section: GeneratedSection,
  label: string,
  chartIds: Set<string>,
  issues: ValidationIssue[],
): void {
  const { layers, layout, regionNames } = collectLayers(section.body)

  // MAP sections must not carry a regions/panel foreground: it renders ON TOP of
  // the map and suppresses the prose rail (`usesRegions` in MapStorySection). A
  // lone flat bigStat (no layout, no named regions) is the one allowed overlay.
  if (story.format === 'map' && (layout || regionNames.length > 0)) {
    issues.push({
      section: label,
      message: `foreground ${layout ? `layout "${layout}"` : 'regions'} over a map suppresses the prose rail — drop the foreground; reference a chart by id and let the prose render in the rail`,
    })
  }

  if (layout) {
    const def = getForegroundLayout(layout)
    if (!def) {
      issues.push({ section: label, message: `unknown layout "${layout}"` })
    } else {
      const valid = new Set(Object.keys(def.regions ?? {}))
      for (const r of regionNames) {
        if (!valid.has(r)) {
          issues.push({
            section: label,
            message: `region "${r}" is not in layout "${layout}" (have: ${[...valid].join(', ')})`,
          })
        }
      }
    }
  }

  for (const layer of layers) {
    const mod = getVizModule(layer.type)
    if (!mod) {
      issues.push({ section: label, layer: layer.type, message: 'unknown layer type' })
      continue
    }
    try {
      mod.parseConfig(layer, { slug: story.slug, label: `${label}:${layer.type}` })
    } catch (e) {
      issues.push({
        section: label,
        layer: layer.type,
        message: e instanceof Error ? e.message : String(e),
      })
    }
    if (layer.type === 'chart' && typeof layer.id === 'string' && !chartIds.has(layer.id)) {
      issues.push({
        section: label,
        layer: 'chart',
        message: `references chart id "${layer.id}" with no matching chart spec`,
      })
    }
  }
}
