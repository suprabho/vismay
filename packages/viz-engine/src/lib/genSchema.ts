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

/** A schema admissible as a member of the layer discriminated union — one
 *  `z.object` with a `type: z.literal(...)` discriminator. Vertical packages
 *  (story-pipeline DomainPacks) supply these to extend the generatable menu. */
export type GenLayerOption = z.ZodDiscriminatedUnionOption<'type'>

/**
 * The layer union extended with vertical module schemas (e.g. `f1:race-card`).
 * Zero extras returns the canonical {@link genForegroundLayerSchema} instance,
 * so the default generation contract is untouched by the seam.
 */
export function genForegroundLayerSchemaWith(extra: readonly GenLayerOption[]) {
  if (extra.length === 0) return genForegroundLayerSchema
  return z.discriminatedUnion('type', [
    bigStatSchema,
    chartSchema,
    bodyTextSchema,
    textSchema,
    quoteSchema,
    keyValueSchema,
    imageSchema,
    imageGridSchema,
    ...extra,
  ])
}

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

/** One named region of a foreground layout, parameterized on the layer union
 *  so vertical extras flow through. The describes live here, once. */
function buildRegionSchema<L extends z.ZodTypeAny>(layer: L) {
  return z.object({
    name: z
      .string()
      .describe('A region name from the chosen layout, e.g. "lead", "chart", "body".'),
    layers: z
      .array(layer)
      .max(1)
      .describe(
        'The single layer placed in this region (max 1). Generated layers carry no position, ' +
          'so each fills its whole region — a second layer would paint on top of the first.'
      ),
  })
}

/** One named region of a foreground layout. */
const genRegionSchema = buildRegionSchema(genForegroundLayerSchema)

/**
 * The section foreground. Use `layout` + `regions` for a composed deck slide,
 * or just `layers` for a single full-slot layer. Leave the whole object out for
 * a text-only section. Shared by the section generator and the per-slot
 * `foreground` editor.
 *
 * Both arms cap at ONE layer per box: generated layers cannot author
 * `style.position`/`style.size`, so every layer is unpositioned and fills its
 * region (`ForegroundVizSlot` gives it `inset: 0`) — two layers in the same
 * region always overlap rather than stack. Positioned multi-layer compositing
 * (badge over chart, scrim over image) stays a hand-authored-config pattern.
 */
function buildForegroundSchema<L extends z.ZodTypeAny>(layer: L) {
  return z.object({
    layout: z
      .string()
      .optional()
      .describe('Optional named deck layout (e.g. "stat-left-chart-right"). Pair with `regions`.'),
    regions: z
      .array(buildRegionSchema(layer))
      .optional()
      .describe('Named regions, used WITH `layout` — each maps a layout region to its single layer.'),
    layers: z
      .array(layer)
      .max(1)
      .optional()
      .describe(
        'A single full-slot foreground layer (max 1), used when there is no `layout` — ' +
          'layout-less layers fill the slot, so a second would paint on top of the first.'
      ),
  })
}

export const genForegroundSchema = buildForegroundSchema(genForegroundLayerSchema)

export type GenForeground = z.infer<typeof genForegroundSchema>

/** The foreground schema with vertical extras in its layer union. Zero extras
 *  returns the canonical {@link genForegroundSchema} instance. */
export function genForegroundSchemaWith(extra: readonly GenLayerOption[]) {
  if (extra.length === 0) return genForegroundSchema
  return buildForegroundSchema(genForegroundLayerSchemaWith(extra))
}

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

/**
 * Repair the pin shapes models commonly emit instead of the canonical
 * `coordinates: [lng, lat]`: Mapbox-style `{lng, lat}` (also `lon`/`longitude`/
 * `latitude`) keys on the pin itself, a `{lng, lat}` OBJECT under
 * `coordinates`, or numeric strings. The JSON schema advertised to the model
 * stays canonical (zod-to-json-schema's default 'input' effect strategy emits
 * the inner schema); this preprocess only makes VALIDATION tolerant, so a
 * near-miss pin is repaired instead of failing the whole section generation.
 */
/** The theme color tokens a generated map layer may reference (`$name` resolves to `--color-<name>`). */
const THEME_COLOR_TOKEN_VALUES = [
  '$accent',
  '$accent2',
  '$teal',
  '$positive',
  '$amber',
  '$red',
  '$muted',
  '$surface',
  '$background',
  '$text',
  '$line',
] as const

/** Map color fields are ENFORCED to this enum — the advertised JSON schema
 *  constrains the model to tokens, so generated maps always follow the theme. */
const themeColorToken = z.enum(THEME_COLOR_TOKEN_VALUES)

/**
 * Normalize a color to an allowed `$`-token: bare names ("accent") gain the
 * `$`; anything else — raw hex, unknown names — DROPS to undefined so the
 * layer falls back to the theme default instead of failing validation or
 * de-theming the map.
 */
function repairColorToken(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.startsWith('$') ? v : `$${v}`
  return (THEME_COLOR_TOKEN_VALUES as readonly string[]).includes(t) ? t : undefined
}

function repairPin(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const p = { ...(raw as Record<string, unknown>) }
  p.color = repairColorToken(p.color)
  const num = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
    return null
  }
  const lngOf = (o: Record<string, unknown>) => num(o.lng ?? o.lon ?? o.longitude)
  const latOf = (o: Record<string, unknown>) => num(o.lat ?? o.latitude)
  // `coordinates: { lng, lat }` object → [lng, lat]
  if (p.coordinates && !Array.isArray(p.coordinates) && typeof p.coordinates === 'object') {
    const c = p.coordinates as Record<string, unknown>
    const lng = lngOf(c)
    const lat = latOf(c)
    if (lng != null && lat != null) p.coordinates = [lng, lat]
  }
  // `coordinates: ["76.5", "24"]` strings → numbers
  if (Array.isArray(p.coordinates)) {
    const nums = p.coordinates.map(num)
    if (nums.length === 2 && nums.every((n) => n != null)) p.coordinates = nums as number[]
  }
  // bare `{ lng, lat }` keys on the pin instead of `coordinates`
  if (p.coordinates == null) {
    const lng = lngOf(p)
    const lat = latOf(p)
    if (lng != null && lat != null) p.coordinates = [lng, lat]
  }
  return p
}

/** A `[lng, lat]` map pin. Exported for the story pipeline's subsection
 *  map-override pass, which emits pins outside a full section body. */
export const genPinSchema = z.preprocess(
  repairPin,
  z.object({
    coordinates: z
      .array(z.number())
      .length(2)
      .describe('[longitude, latitude] — longitude FIRST, as a 2-number array (never lng/lat keys).'),
    label: z.string().optional(),
    color: themeColorToken
      .optional()
      .describe(
        'Theme token (follows the story theme; raw hex is not accepted). Omit to use the story ' +
          'default pin color — most pins should.',
      ),
    radius: z.number().optional(),
    pulse: z.boolean().optional().describe('Animate a pulsing ring (use sparingly — for the focal pin).'),
    labelAnchor: z
      .enum(['top', 'bottom', 'left', 'right'])
      .optional()
      .describe('Which side of the pin the label sits on.'),
  }),
)

// ── Choropleth regions — the PRIMARY data visual of a Vizmaya map story ──────
//
// In a real map story the polygons carry the numbers: the camera frames the
// region in focus and `regions` shades each area by a source-derived value (the
// map IS the chart). This mirrors viz-engine's `MapRegionLayer` (types/story.ts)
// while staying provider-structured-output safe — array-shaped, no `z.record`.

/** One shaded region: an explicit `color`, or a `value` driven through the ramp. */
const genRegionItemSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
    const item = raw as Record<string, unknown>
    return { ...item, color: repairColorToken(item.color) }
  },
  z.object({
    code: z
      .string()
      .describe('ISO 3166-1 alpha-2 (level: country) or the GeoJSON feature id (level: custom).'),
    value: z
      .number()
      .optional()
      .describe('The choropleth metric — mapped through `colors`/`ramp` when `color` is omitted.'),
    color: themeColorToken
      .optional()
      .describe(
        'Explicit fill — a theme token (raw hex is not accepted); overrides the ramp. ' +
          'Use for categorical shading.',
      ),
    opacity: z.number().optional().describe('Fill opacity 0–1. Default 0.55.'),
    label: z.string().optional().describe('Optional region label.'),
  }),
)

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

/** Repair a region layer's colors to enforced tokens: bare names gain the `$`;
 *  a ramp with any unrepairable stop drops whole (the engine default applies)
 *  so the stops never fall out of step with `ramp`. */
function repairRegionColors(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const r = { ...(raw as Record<string, unknown>) }
  r.lineColor = repairColorToken(r.lineColor)
  if (Array.isArray(r.colors)) {
    const stops = r.colors.map(repairColorToken)
    r.colors = stops.every((c) => c != null) ? stops : undefined
  }
  return r
}

/**
 * A choropleth overlay for a map section. Shades each region in `items` by its
 * `value` (interpolated across `colors`/`ramp`) or an explicit `color`.
 * `level: "country"` uses built-in country boundaries (code = ISO alpha-2);
 * `level: "custom"` requires `geojsonUrl` + `idProperty`.
 */
const genRegionsSchema = z.preprocess(
  repairRegionColors,
  z.object({
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
      .array(themeColorToken)
      .optional()
      .describe(
        'Ramp color stops, low→high — theme tokens only (e.g. "$surface", "$teal", "$accent"; ' +
          'raw hex is not accepted — tokens follow the story theme). Values interpolate between them.',
      ),
    ramp: z
      .array(z.number())
      .optional()
      .describe('Domain values matching `colors` (same length). Omit to auto-fit [min,max] from items.'),
    lineColor: themeColorToken
      .optional()
      .describe('Border color — a theme token, typically "$background" or "$surface".'),
    lineWidth: z.number().optional().describe('Border width in px. Default 0.6.'),
    labels: genRegionLabelsSchema.optional().describe('Auto-label regions on the map.'),
    legend: genRegionLegendSchema.optional().describe('Color-ramp legend overlay.'),
  }),
)

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
function buildSectionBodySchema<F extends z.ZodTypeAny>(foreground: F) {
  return z.object({
  foreground: foreground
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
  // ── Editorial cover surface (HERO/COVER sections only) ────────────────────
  // These land on the section entry itself (not inside foreground). The deck
  // renderer's full-bleed cover branch fires ONLY on section-root
  // `layout: "hero-full-bleed"` — a layout inside `foreground` does not reach it.
  layout: z
    .string()
    .optional()
    .describe(
      'HERO/COVER only — section-root layout. Set "hero-full-bleed" to render the editorial ' +
        'full-bleed cover (scrim + headline overlay; the hero image is attached later). ' +
        'Non-cover sections set layout INSIDE foreground, not here.',
    ),
  eyebrow: z
    .string()
    .optional()
    .describe(
      'HERO/COVER kicker line above the title — "Topic · Date · What this is" ' +
        '(e.g. "SpaceX S-1 · May 20, 2026 · $1.75 Trillion IPO Analysis").',
    ),
  dek: z
    .string()
    .optional()
    .describe(
      'HERO/COVER one-line standfirst rendered below the title on the full-bleed cover. ' +
        'Deck covers only — a map hero carries its dek in the markdown prose.',
    ),
  })
}

export const sectionBodySchema = buildSectionBodySchema(genForegroundSchema)

export type SectionBody = z.infer<typeof sectionBodySchema>

/**
 * The section-body schema with vertical module schemas spliced into the
 * foreground layer union — the DomainPack seam's provider contract. Zero
 * extras returns the canonical {@link sectionBodySchema} instance, so default
 * (vizmaya) generation is structurally untouched. Map narrowings
 * ({@link mapSectionBodySchemaFor}) take no extras — vertical layers are a
 * deck-only concern.
 */
export function sectionBodySchemaWith(extra: readonly GenLayerOption[]) {
  if (extra.length === 0) return sectionBodySchema
  return buildSectionBodySchema(genForegroundSchemaWith(extra))
}

/**
 * The MAP-format narrowing of {@link sectionBodySchema} — on a map section the
 * map IS the visual (camera + pins + choropleth carry the data; the prose
 * renders in the scroll rail). Deck panels over the map bury both, so here they
 * are UNREPRESENTABLE rather than discouraged:
 *   - `map` is required — a map section without a camera doesn't exist;
 *   - `foreground` cannot take `layout`/`regions` — at most ONE lone bigStat;
 *   - `eyebrow` is required when `requireEyebrow` (hero sections — the
 *     establishing shot always carries its kicker line).
 * Charts are attached at the section level (`chart: data:<id>`) by the
 * pipeline, never authored as layers. The output is a structural subset of
 * {@link SectionBody}, so {@link normalizeSectionBody} applies unchanged.
 */
export function mapSectionBodySchemaFor(opts: { requireEyebrow?: boolean } = {}) {
  const eyebrow = z
    .string()
    .describe(
      'HERO kicker line above the title — "Topic · Period · What this is" ' +
        '(e.g. "Jammu & Kashmir · 1941–1951 · Census + Land Reform").',
    )
  return z.object({
    map: genMapCameraSchema.describe(
      'The section camera: center [lng, lat] + zoom (always set both), optional pitch/bearing/' +
        'opacity, focal pins, and the `regions` choropleth — the map is where a map section ' +
        'carries its data.',
    ),
    foreground: z
      .object({
        // Optional so a stray deck-panel shape (layout/regions — stripped as
        // unknown keys) degrades to an empty foreground that normalizes away,
        // instead of failing the whole section generation.
        layers: z
          .array(bigStatSchema)
          .max(1)
          .optional()
          .describe('The single hero bigStat — its value must be a NUMBER from the prose.'),
      })
      .optional()
      .describe(
        'RARE — a lone giant-number overlay. Omit for nearly every section: the prose renders ' +
          'in the scroll rail, and deck layouts/panels do not exist on map sections.',
      ),
    eyebrow: opts.requireEyebrow ? eyebrow : eyebrow.optional(),
  })
}

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
  if (body.layout?.trim()) out.layout = body.layout.trim()
  if (body.eyebrow?.trim()) out.eyebrow = body.eyebrow.trim()
  if (body.dek?.trim()) out.dek = body.dek.trim()
  return out
}
