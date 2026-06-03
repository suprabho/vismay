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
  color: z.string().optional(),
  radius: z.number().optional(),
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
  pins: z.array(genPinSchema).optional().describe('Optional location pins.'),
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
    .describe('Map-format only: the autoplay camera for this section.'),
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
