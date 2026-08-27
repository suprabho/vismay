import { stringify as stringifyYaml } from 'yaml'
import type { ResolvedUnit } from '@vismay/viz-engine'

const HEADER = `# Sample share.yaml for this story.
#
# Every section override is optional — delete anything you don't want to change.
# Pre-populated values mirror the current story config so the file is a
# starting template, not a forced override.
#
# Fields per section:
#   heading / subheading           base text on map-title cards
#   chart.{heading,subheading}     chart-card text
#   mapTitle.{heading,subheading,dek}  map-title overlay text (dek: hero only)
#   hero.{heading,subheading,dek}  standalone hero-card text
#   hero.imageOffset               CSS object-position to re-frame the cover
#                                  image crop on this card (e.g. right, 30% 50%)
#   stat.description               stat-card description
#   hide                           true → hide the section on share entirely
#   hidePretext                    true → hide the body PretextBlock (text cards)
#   layers.{pins,regions,heatmap}  per-card map-layer toggles
#   paragraphsOverride             literal replacement paragraphs (1 card / entry)
#   shareParagraphs                slice indices [start,end] into source paragraphs
#   subsections.<index>            per-subsection overrides (0-based)
#   regionLabelCodes               thin patch on the parent's regions.labels.codes
#                                  allowlist (e.g. ["Hawaii","Oklahoma"]); replaces
#                                  the inherited list for this card only
#   pinOverrides.<label>           thin patch on a single resolved pin (color,
#                                  radius, pulse, labelAnchor); keyed by the pin's
#                                  label text from the parent config
#   map.{center,zoom,pitch,...}    per-card map camera + layers (advanced)
#   map.ratios.<1:1|3:4|4:3>.{center,zoom,pitch,bearing}
#                                  per-aspect camera override; falls back to
#                                  the base map fields when unset
#
# Top-level: \`logo\` (path under /public) sets the cards' top-right mark.
`

type Kind = 'text' | 'hero' | 'stat'

interface SectionGroup {
  id: string
  kind: Kind
  hasChart: boolean
  units: ResolvedUnit[]
}

function groupBySection(units: ResolvedUnit[]): SectionGroup[] {
  const groups = new Map<number, SectionGroup>()
  for (const u of units) {
    const id = u.parentConfig.id
    if (!id) continue
    const kind = (u.parentConfig.kind ?? 'text') as Kind
    const existing = groups.get(u.parentIndex)
    if (existing) {
      existing.units.push(u)
    } else {
      groups.set(u.parentIndex, {
        id,
        kind,
        hasChart: !!u.parentConfig.chart,
        units: [u],
      })
    }
  }
  return Array.from(groups.values())
}

function buildSubsectionEntry(u: ResolvedUnit, kind: Kind): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (u.heading) out.heading = u.heading
  if (u.subheading) out.subheading = u.subheading
  if (kind === 'hero') {
    out.hero = {
      heading: u.heading ?? '',
      subheading: u.subheading ?? '',
      dek: u.paragraphs[0] ?? '',
    }
  }
  if (kind === 'stat') {
    out.stat = { description: u.paragraphs.join(' ') }
  }
  if (kind === 'text' && u.paragraphs.length > 0) {
    out.paragraphsOverride = u.paragraphs.slice()
  }
  return out
}

function buildSectionEntry(group: SectionGroup): Record<string, unknown> {
  const first = group.units[0]
  const { kind, hasChart } = group
  const out: Record<string, unknown> = {}

  if (first.heading) out.heading = first.heading
  if (first.subheading) out.subheading = first.subheading
  out.hide = false
  if (kind === 'text') out.hidePretext = false
  out.layers = { pins: true, regions: true, heatmap: false }

  // Surface the parent's region-label allowlist as a discoverable template
  // slot so the user can drop or swap labels for this card via the YAML view.
  const parentLabelCodes = first.parentConfig.map?.regions?.labels?.codes
  if (parentLabelCodes && parentLabelCodes.length > 0) {
    out.regionLabelCodes = parentLabelCodes.slice()
  }

  // Stub a `pinOverrides` entry per labeled pin so the YAML view shows what's
  // available to tweak. Empty patches let users see the shape and fill in.
  const parentPins = first.parentConfig.map?.pins ?? []
  const labeledPins = parentPins.filter((p) => !!p.label)
  if (labeledPins.length > 0) {
    const overrides: Record<string, Record<string, unknown>> = {}
    for (const pin of labeledPins) {
      overrides[pin.label!] = {
        color: pin.color ?? '',
        radius: pin.radius ?? '',
        pulse: pin.pulse ?? false,
        labelAnchor: pin.labelAnchor ?? '',
      }
    }
    out.pinOverrides = overrides
  }

  if (hasChart) {
    out.chart = {
      heading: first.heading ?? '',
      subheading: first.subheading ?? '',
    }
  }

  out.mapTitle = {
    heading: first.heading ?? '',
    subheading: first.subheading ?? '',
    ...(kind === 'hero' ? { dek: first.paragraphs[0] ?? '' } : {}),
  }

  if (kind === 'hero') {
    out.hero = {
      heading: first.heading ?? '',
      subheading: first.subheading ?? '',
      dek: first.paragraphs[0] ?? '',
    }
  }

  if (kind === 'stat') {
    out.stat = { description: first.paragraphs.join(' ') }
  }

  if (group.units.length > 1) {
    const subsections: Record<number, unknown> = {}
    for (const u of group.units) {
      subsections[u.subIndex] = buildSubsectionEntry(u, kind)
    }
    out.subsections = subsections
  } else if (kind === 'text' && first.paragraphs.length > 0) {
    out.paragraphsOverride = first.paragraphs.slice()
  }

  return out
}

/**
 * Produce a fully-populated share.yaml template using the story's resolved
 * units. Every section with an `id` gets an entry containing every relevant
 * override slot, with current copy from the story config pre-filled. Used by
 * the share page's YAML view as an "insert sample" / download starting point.
 */
export function buildShareSampleYaml(units: ResolvedUnit[]): string {
  const groups = groupBySection(units)
  const sections: Record<string, unknown> = {}
  for (const g of groups) {
    sections[g.id] = buildSectionEntry(g)
  }
  const body = stringifyYaml(
    { sections },
    {
      lineWidth: 0,
      blockQuote: 'literal',
    },
  )
  return `${HEADER}\n${body}`
}
