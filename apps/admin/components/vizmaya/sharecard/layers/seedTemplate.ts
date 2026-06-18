import { resolveSlotsFlat } from '@vismay/viz-engine'
import type { ResolvedUnit, Theme } from '@vismay/viz-engine'
import type { AspectRatio } from '../AspectRatioToggle'
import type {
  CardComposition,
  FontFamily,
  TemplateKind,
  TextBlock,
  TextStyle,
  Transform,
} from './types'
import { DEFAULT_TRANSFORM, emptyMapSpec } from './types'

/**
 * Seeds a starting composition for a template. Templates are just presets — the
 * user can then edit/add/remove any slot. Text colors are baked to concrete hex
 * from the story theme (capture-safe; the html-to-image clone doesn't reliably
 * resolve `var()`), positions are %-based so they survive ratio changes.
 *
 * Map data (pins/regions/camera) is NOT seeded here: the map slot starts with an
 * empty per-ratio camera, and `LayeredShareCard` falls back to the unit's
 * resolved camera (+ share zoom-delta) until the user reframes it.
 */

/** The slice of the loaded story that seeding needs. */
export interface SeedStory {
  theme: Theme
}

let seedSeq = 0
function uid(prefix: string): string {
  return `${prefix}-${seedSeq++}`
}

function textBlock(
  text: string,
  transform: Partial<Transform>,
  style: Partial<TextStyle>,
  fallbackColor: string,
): TextBlock {
  return {
    id: uid('txt'),
    text,
    visible: true,
    transform: { ...DEFAULT_TRANSFORM, ...transform },
    style: {
      color: style.color ?? fallbackColor,
      fontFamily: style.fontFamily ?? 'serif',
      fontWeight: style.fontWeight ?? 700,
      fontSizePx: style.fontSizePx ?? 24,
      align: style.align ?? 'left',
      lineHeight: style.lineHeight ?? 1.2,
    },
  }
}

interface UnitSupport {
  hasMap: boolean
  chartId?: string
}

export function detectSupport(unit: ResolvedUnit): UnitSupport {
  const slots = resolveSlotsFlat(unit.parentConfig)
  const hasMap = slots.background.some(
    (l) => l.type === 'map' && Array.isArray((l as { center?: unknown }).center),
  )
  const chartLayer = slots.foreground.find((l) => l.type === 'chart') as { id?: string } | undefined
  return { hasMap, chartId: chartLayer?.id }
}

export function seedTemplate(
  kind: TemplateKind,
  unit: ResolvedUnit,
  story: SeedStory,
  _ratio: AspectRatio,
): CardComposition {
  const c = story.theme.colors
  const support = detectSupport(unit)
  const heading = unit.heading?.trim() || ''
  const subheading = unit.subheading?.trim() || ''
  const body = unit.paragraphs.join('\n\n').trim()

  const serif: FontFamily = 'serif'
  const sans: FontFamily = 'sans'

  const branding = { visible: true }

  if (kind === 'map-caption') {
    return {
      background: support.hasMap ? { kind: 'map', ...emptyMapSpec() } : { kind: 'solid', color: c.surface },
      hero: undefined,
      elements: [],
      text: {
        heading: heading
          ? textBlock(heading, { xPct: 50, yPct: 14, widthPct: 86 }, { color: c.text, fontFamily: serif, fontWeight: 700, fontSizePx: 26 }, c.text)
          : undefined,
        subheading: subheading
          ? textBlock(subheading, { xPct: 50, yPct: 27, widthPct: 86 }, { color: c.muted, fontFamily: sans, fontWeight: 400, fontSizePx: 15, lineHeight: 1.4 }, c.muted)
          : undefined,
        annotations: [],
      },
      branding,
    }
  }

  if (kind === 'data') {
    return {
      background: { kind: 'none' },
      hero: support.chartId
        ? { kind: 'chart', chartId: support.chartId, heading: undefined, subheading: undefined }
        : support.hasMap
          ? { kind: 'map', ...emptyMapSpec() }
          : undefined,
      elements: [],
      text: {
        heading: heading
          ? textBlock(heading, { xPct: 50, yPct: 9, widthPct: 90 }, { color: c.text, fontFamily: serif, fontWeight: 700, fontSizePx: 22, align: 'center' }, c.text)
          : undefined,
        subheading: undefined,
        annotations: [],
      },
      branding,
    }
  }

  // title-text
  return {
    background: { kind: 'solid', color: c.background },
    hero: undefined,
    elements: [],
    text: {
      heading: heading
        ? textBlock(heading, { xPct: 50, yPct: 22, widthPct: 86 }, { color: c.text, fontFamily: serif, fontWeight: 700, fontSizePx: 30 }, c.text)
        : undefined,
      subheading: subheading
        ? textBlock(subheading, { xPct: 50, yPct: 40, widthPct: 86 }, { color: c.muted, fontFamily: sans, fontWeight: 400, fontSizePx: 16, lineHeight: 1.4 }, c.muted)
        : undefined,
      annotations: body
        ? [textBlock(body, { xPct: 50, yPct: 64, widthPct: 86 }, { color: c.text, fontFamily: sans, fontWeight: 400, fontSizePx: 14, lineHeight: 1.5 }, c.text)]
        : [],
    },
    branding,
  }
}
