/**
 * AI section-generation schema — the structured-output contract for the admin
 * "generate a section" route.
 *
 * The model used to hand-write a YAML string for a section's visual content,
 * and a chain of fixers tried to repair the inevitable malformed output. This
 * schema removes that failure mode at the root: the model fills a typed JSON
 * object constrained (at the provider level, via `generateObject`) by the SAME
 * Zod layer schemas the renderer validates with, and `normalizeSectionBody`
 * deterministically reshapes it into the config-entry the engine parses. The
 * YAML is then produced by `yaml.stringify` — so it is valid by construction.
 *
 * Design constraints for provider structured-output compatibility:
 *   - no `z.record` (arbitrary-key objects) — regions are modelled as an array
 *     of `{ name, layers }` and folded back into a mapping here;
 *   - no tuples — coordinates are `array(number).length(2)`;
 *   - only the layer modules with clean, flat schemas are offered for
 *     generation (the discriminated union below). Authors can still hand-add
 *     the richer layers (table, rive, video, embed); they're just not generated.
 */

import { z } from 'zod'
import { bigStatSchema } from '../modules/bigStat'
import { chartSchema } from '../modules/chart'
import { bodyTextSchema } from '../modules/bodyText'
import { textSchema } from '../modules/text'
import { quoteSchema } from '../modules/quote'
import { keyValueSchema } from '../modules/keyValue'
import { imageSchema } from '../modules/image'
import { imageGridSchema } from '../modules/imageGrid'

/**
 * The foreground layer types the generator can emit, as a discriminated union
 * on `type`. Each member is the module's own validation schema — one source of
 * truth for the renderer, the AI contract, and the field docs.
 */
export const genForegroundLayerSchema = z.discriminatedUnion('type', [
  bigStatSchema,
  chartSchema,
  bodyTextSchema,
  textSchema,
  quoteSchema,
  keyValueSchema,
  imageSchema,
  imageGridSchema,
])

export type GenForegroundLayer = z.infer<typeof genForegroundLayerSchema>

/** `[{ type, label }]` for the offered foreground layer types — used in the prompt. */
export const GEN_FOREGROUND_TYPES: ReadonlyArray<{ type: string; label: string }> = [
  { type: 'bigStat', label: 'a giant number with label + delta' },
  { type: 'chart', label: 'references a chart already defined for the story by id' },
  { type: 'bodyText', label: 'prose paragraphs' },
  { type: 'text', label: 'a text or stat panel that falls back to the section content' },
  { type: 'quote', label: 'a pull quote with optional attribution' },
  { type: 'keyValue', label: 'a two-column definition list' },
  { type: 'image', label: 'a single image (needs a src)' },
  { type: 'imageGrid', label: '2–6 images in a mosaic' },
]

/** One named region of a foreground layout. */
const genRegionSchema = z.object({
  name: z
    .string()
    .describe('A region name from the chosen layout, e.g. "lead", "chart", "body".'),
  layers: z.array(genForegroundLayerSchema).describe('The layers placed in this region.'),
})

/**
 * The section foreground. Use `layout` + `regions` for a composed deck slide,
 * or just `layers` for a simple stacked list. Leave the whole object out for a
 * text-only section. Shared by the section generator and the per-slot
 * `foreground` editor.
 */
export const genForegroundSchema = z.object({
  layout: z
    .string()
    .optional()
    .describe('Optional named deck layout (e.g. "stat-left-chart-right"). Pair with `regions`.'),
  regions: z
    .array(genRegionSchema)
    .optional()
    .describe('Named regions, used WITH `layout` — each maps a layout region to its layers.'),
  layers: z
    .array(genForegroundLayerSchema)
    .optional()
    .describe('A flat list of foreground layers, used when there is no `layout`.'),
})

export type GenForeground = z.infer<typeof genForegroundSchema>

/**
 * Reshape a validated `genForegroundSchema` into the foreground value the engine
 * parses — a single layer mapping, a flat list, or a `{ layout, regions }`
 * mapping (regions array folded into a `{ name: layers }` object). Returns null
 * when the foreground carries no content.
 */
export function normalizeForeground(fg: GenForeground | undefined): unknown {
  if (!fg) return null
  if (fg.regions && fg.regions.length > 0) {
    const regions: Record<string, unknown> = {}
    for (const r of fg.regions) regions[r.name] = r.layers
    return fg.layout ? { layout: fg.layout, regions } : { regions }
  }
  if (fg.layers && fg.layers.length > 0) {
    // A flat list — emit the single layer directly when there's only one.
    return fg.layers.length === 1 ? fg.layers[0] : fg.layers
  }
  return null
}

/** A `[lng, lat]` map pin. */
const genPinSchema = z.object({
  coordinates: z.array(z.number()).length(2).describe('[longitude, latitude].'),
  label: z.string().optional(),
  color: z
    .string()
    .optional()
    .describe('Theme token ("$accent", "$red", …) or hex. Omit to use the story default pin color.'),
  radius: z.number().optional(),
  pulse: z.boolean().optional().describe('Animate a pulsing ring (use sparingly — for the focal pin).'),
  labelAnchor: z
    .enum(['top', 'bottom', 'left', 'right'])
    .optional()
    .describe('Which side of the pin the label sits on.'),
})

// ── Choropleth regions — the PRIMARY data visual of a Vizmaya map story ──────
//
// In a real map story the polygons carry the numbers: the camera frames the
// region in focus and `regions` shades each area by a source-derived value (the
// map IS the chart). This mirrors viz-engine's `MapRegionLayer` (types/story.ts)
// while staying provider-structured-output safe — array-shaped, no `z.record`.

/** One shaded region: an explicit `color`, or a `value` driven through the ramp. */
const genRegionItemSchema = z.object({
  code: z
    .string()
    .describe('ISO 3166-1 alpha-2 (level: country) or the GeoJSON feature id (level: custom).'),
  value: z
    .number()
    .optional()
    .describe('The choropleth metric — mapped through `colors`/`ramp` when `color` is omitted.'),
  color: z
    .string()
    .optional()
    .describe('Explicit fill ($-token or hex) — overrides the ramp. Use for categorical shading.'),
  opacity: z.number().optional().describe('Fill opacity 0–1. Default 0.55.'),
  label: z.string().optional().describe('Optional region label.'),
})

/** Auto-label config for a region layer (region name, optionally with its value). */
const genRegionLabelsSchema = z.object({
  show: z.boolean().optional().describe('Label each region with its name.'),
  withValue: z.boolean().optional().describe("Append each region's value after its name."),
  valueSuffix: z.string().optional().describe('Suffix wrapped around the value (e.g. "%").'),
  size: z.number().optional().describe('Label text size in px. Default 11.'),
})

/** Color-ramp legend overlay. */
const genRegionLegendSchema = z.object({
  show: z.boolean().optional(),
  title: z.string().optional().describe('Legend caption (e.g. "Muslim share of population, 1941").'),
  lowLabel: z.string().optional().describe('Label for the low end of the ramp.'),
  highLabel: z.string().optional().describe('Label for the high end of the ramp.'),
  position: z
    .enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top', 'bottom'])
    .optional()
    .describe('Placement within the frame. Default "top-left".'),
})

/**
 * A choropleth overlay for a map section. Shades each region in `items` by its
 * `value` (interpolated across `colors`/`ramp`) or an explicit `color`.
 * `level: "country"` uses built-in country boundaries (code = ISO alpha-2);
 * `level: "custom"` requires `geojsonUrl` + `idProperty`.
 */
const genRegionsSchema = z.object({
  level: z
    .enum(['country', 'custom'])
    .describe('"country" = built-in country boundaries; "custom" = your own GeoJSON (needs geojsonUrl + idProperty).'),
  geojsonUrl: z
    .string()
    .optional()
    .describe('level: custom — URL or absolute /public path to the GeoJSON.'),
  idProperty: z
    .string()
    .optional()
    .describe('level: custom — the GeoJSON feature property whose value matches items[].code.'),
  items: z
    .array(genRegionItemSchema)
    .min(1)
    .describe('One entry per shaded region. Source-grounded: each `value` must come from the material.'),
  colors: z
    .array(z.string())
    .optional()
    .describe('Ramp color stops ($-tokens or hex), low→high. Values interpolate between them.'),
  ramp: z
    .array(z.number())
    .optional()
    .describe('Domain values matching `colors` (same length). Omit to auto-fit [min,max] from items.'),
  lineColor: z.string().optional().describe('Border color ($-token or hex).'),
  lineWidth: z.number().optional().describe('Border width in px. Default 0.6.'),
  labels: genRegionLabelsSchema.optional().describe('Auto-label regions on the map.'),
  legend: genRegionLegendSchema.optional().describe('Color-ramp legend overlay.'),
})

/**
 * A map layer for the BACKGROUND slot — a clean (non-passthrough) view of the
 * map module: required camera, optional tilt/pins. Distinct from the section
 * `map:` override camera below, whose fields are all optional.
 */
const genMapLayerSchema = z.object({
  type: z.literal('map'),
  center: z.array(z.number()).length(2).describe('[longitude, latitude].'),
  zoom: z.number().describe('Camera zoom level.'),
  pitch: z.number().optional().describe('Camera tilt in degrees (0 = top-down).'),
  bearing: z.number().optional().describe('Camera rotation in degrees.'),
  opacity: z.number().optional().describe('Map layer opacity, 0..1.'),
  pins: z.array(genPinSchema).optional().describe('Optional location pins.'),
  regions: genRegionsSchema
    .optional()
    .describe('Choropleth overlay — shade regions by a source-derived value (the map IS the chart).'),
})

/** Suppress the section backdrop entirely. */
const genNoneLayerSchema = z.object({ type: z.literal('none') })

/**
 * A section background: a single image or map layer, or `{ type: none }` to
 * suppress the backdrop. Shared by the section generator and the per-slot
 * `background` editor. The value is the layer mapping itself — no wrapper.
 */
export const genBackgroundSchema = z.discriminatedUnion('type', [
  imageSchema,
  genMapLayerSchema,
  genNoneLayerSchema,
])

export type GenBackground = z.infer<typeof genBackgroundSchema>

/**
 * Autoplay map camera for a MAP-format section's top-level `map:` block. As a
 * SECTION override every field is optional (field-level merge); the section
 * generator still expects `center` + `zoom`, which it documents in the prompt.
 */
export const genMapCameraSchema = z.object({
  center: z.array(z.number()).length(2).optional().describe('[longitude, latitude].'),
  zoom: z.number().optional().describe('Camera zoom level.'),
  pitch: z.number().optional().describe('Camera tilt in degrees (0 = top-down).'),
  bearing: z.number().optional().describe('Camera rotation in degrees.'),
  opacity: z.number().optional().describe('Map opacity, 0..1.'),
  flySpeed: z.number().optional().describe('Camera fly-to speed multiplier.'),
  pins: z.array(genPinSchema).optional().describe('Optional location pins.'),
  regions: genRegionsSchema
    .optional()
    .describe(
      'Choropleth overlay — the PRIMARY data visual of a map section: shade each region by a ' +
        'source-derived `value`. The camera frames the region in focus; the polygons carry the numbers.',
    ),
})

export type GenMapCamera = z.infer<typeof genMapCameraSchema>

/**
 * The visual content of ONE generated section. All three keys are optional — a
 * deck section typically sets `foreground`; a map section sets `map`. `id`,
 * `text`, and `kind` live on the section entry itself, NOT here.
 */
export const sectionBodySchema = z.object({
  foreground: genForegroundSchema
    .optional()
    .describe('Deck content layered over the backdrop.'),
  background: genBackgroundSchema
    .optional()
    .describe('Optional image/map backdrop for this section, or { type: none }.'),
  map: genMapCameraSchema
    .optional()
    .describe(
      'Map-format only: the section camera (center/zoom/pitch) plus its `regions` choropleth — ' +
        'shade regions by value. This is where a map section carries its data, not the foreground.',
    ),
})

export type SectionBody = z.infer<typeof sectionBodySchema>

/**
 * Reshape the validated generation body into the config-entry `body` object the
 * engine parses (and `appendStorySection` serialises). Folds the foreground via
 * {@link normalizeForeground} and drops empty branches.
 */
export function normalizeSectionBody(body: SectionBody): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const fg = normalizeForeground(body.foreground)
  if (fg) out.foreground = fg
  if (body.background) out.background = body.background
  if (body.map) out.map = body.map
  return out
}
