import { z } from 'zod'
import {
  sectionBodySchema,
  sectionBodySchemaWith,
  mapSectionBodySchemaFor,
  genPinSchema,
} from './vizEngine'
import { VIZMAYA_PACK } from './packs/vizmaya'
import type { DomainPack } from './packs/types'

/**
 * Zod schemas that constrain the two LLM calls at the provider level (via
 * `generateObject`). The section `body` reuses viz-engine's `sectionBodySchema`
 * — the SAME layer schemas the renderer validates with — so a generated section
 * can never carry malformed visual config. Designed for provider
 * structured-output compatibility: no `z.record`, no tuples.
 */

/** Section kinds the engine understands (mirrors the canvas generate-section route). */
export const SECTION_KINDS = [
  'text',
  'hero',
  'stat',
  'cover',
  'bigStat',
  'bodyText',
  'split',
  'data',
  'gallery',
  'quote',
  'divider',
  'closing',
] as const

/**
 * Section kinds allowed on a MAP story. A map section renders its prose in the
 * scroll rail; the remaining (deck/panel) kinds live in the renderer's
 * `DECK_KINDS_NO_TEXT_CARD` set (story-reader's MapStorySection) and SUPPRESS
 * that rail — and on a map section there is no foreground panel meant to carry
 * the copy, so the markdown then renders nowhere (a blank snap target). Map
 * stories are therefore restricted to the narrative kinds that keep the rail.
 * `cover` is deliberately absent: the renderer just aliases it to `hero`, and
 * letting the model say "cover" invites deck-cover habits — a map story opens
 * with a `hero` establishing shot.
 */
export const MAP_SECTION_KINDS = ['text', 'hero', 'stat'] as const

/** The section-kind tuple a given story format may use. */
export function sectionKindsFor(format: 'deck' | 'map'): readonly string[] {
  return format === 'map' ? MAP_SECTION_KINDS : SECTION_KINDS
}

/** A `kind` enum field narrowed to what the format allows, with format-specific copy. */
function kindField(format: 'deck' | 'map') {
  const desc =
    format === 'map'
      ? 'Section kind — a MAP story uses narrative kinds only: text | hero | stat. ' +
        'These keep the scroll prose rail; deck/panel kinds would suppress it and orphan the prose. ' +
        '"hero" is the opening establishing shot (a map story has no "cover"). ' +
        '"stat" renders the section HEADING as a giant figure, so use it only when the heading is ' +
        'a number (e.g. "18.7 GW").'
      : 'The section kind.'
  return (format === 'map' ? z.enum(MAP_SECTION_KINDS) : z.enum(SECTION_KINDS)).describe(desc)
}

export const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const

// ── Phase 1: research brief ────────────────────────────────────────────────

export const clarifyingQuestionSchema = z.object({
  id: z
    .string()
    .describe('Stable kebab-case id the answer is keyed by, e.g. "lead-angle".'),
  question: z.string().describe('The question to ask the editor.'),
  why: z.string().optional().describe('One line on why this matters for the story.'),
  kind: z
    .enum(['choice', 'text'])
    .describe('"choice" offers fixed options; "text" is free-text.'),
  options: z
    .array(z.string())
    .optional()
    .describe('2–4 options — required when kind is "choice".'),
})

export const researchBriefSchema = z.object({
  summary: z.string().describe('A tight 2–4 sentence synthesis of what the sources are about.'),
  keyFacts: z
    .array(z.string())
    .describe('The load-bearing facts/figures a data story would be built on.'),
  entities: z
    .array(z.string())
    .describe('The main people, orgs, places, or things the story concerns.'),
  suggestedFormat: z
    .enum(['deck', 'map'])
    .describe('"deck" for a slide narrative; "map" when geography is central.'),
  candidateAngles: z
    .array(z.string())
    .describe('2–4 distinct angles the story could take.'),
  questions: z
    .array(clarifyingQuestionSchema)
    .min(3)
    .max(6)
    .describe('3–6 clarifying questions the editor must answer before generation.'),
})

export type ResearchBriefOutput = z.infer<typeof researchBriefSchema>

// ── Angles (the canvas compose flow's research gate) ───────────────────────
//
// Like the research brief, but the human gate is "pick an angle" rather than a
// clarifying-questions form: each angle is a rich card (title + thesis +
// rationale) the author chooses between before the outline is written.

export const angleSchema = z.object({
  title: z.string().describe('A short, specific angle headline.'),
  thesis: z.string().describe('The one-sentence claim this angle makes.'),
  rationale: z.string().describe('Why this angle is worth taking, grounded in the sources.'),
})

export const anglesBriefSchema = z.object({
  summary: z.string().describe('A tight 2–4 sentence synthesis of what the sources are about.'),
  keyFacts: z
    .array(z.string())
    .describe('The load-bearing facts/figures a data story would be built on.'),
  entities: z
    .array(z.string())
    .describe('The main people, orgs, places, or things the story concerns.'),
  suggestedFormat: z
    .enum(['deck', 'map'])
    .describe('"deck" for a slide narrative; "map" when geography is central.'),
  angles: z
    .array(angleSchema)
    .min(3)
    .max(5)
    .describe('3–5 distinct angles the story could take.'),
})

export type AnglesBriefOutput = z.infer<typeof anglesBriefSchema>

// ── Phase 2: story generation ──────────────────────────────────────────────

export const chartSpecSchema = z.object({
  id: z
    .string()
    .describe('kebab-case id; a chart layer references this exact id.'),
  title: z.string().optional().describe('Chart title.'),
  chartType: z.enum(['bar', 'line']).describe('Chart type.'),
  categories: z.array(z.string()).describe('X-axis category labels.'),
  series: z
    .array(
      z.object({
        name: z.string().describe('Series name (shown in the legend).'),
        data: z.array(z.number()).describe('One value per category, same order.'),
      }),
    )
    .describe('One or more data series.'),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
})

/**
 * A chart REQUIREMENT — what the outline plans, with no numbers. The outline is
 * a skeleton (no prose, no data); fabricating accurate series there is
 * unreliable, so the outline only declares the chart's shape + a precise
 * `requirement` describing what to plot. A focused, source-grounded
 * `generateChart` pass then fills in the data (see `chartDataSchema`).
 */
export const chartRequirementSchema = z.object({
  id: z
    .string()
    .describe('kebab-case id; a chart layer references this exact id.'),
  title: z.string().optional().describe('Chart title.'),
  chartType: z.enum(['bar', 'line']).describe('Chart type.'),
  requirement: z
    .string()
    .describe(
      'Exactly what this chart must plot — which figures/series/categories and ' +
        'over what range/time, all sourced from the material. Concrete, NOT generic; ' +
        'do NOT invent the numbers here (the data pass produces them).',
    ),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
})

/**
 * The data-only OUTPUT of the `generateChart` pass: categories + numeric series
 * grounded in the sources. Merged with its `chartRequirement` (id/title/type/
 * axes) to form a full `ChartSpec` that `buildEChartsOption` expands.
 */
export const chartDataSchema = z.object({
  categories: z.array(z.string()).describe('X-axis category labels.'),
  series: z
    .array(
      z.object({
        name: z.string().describe('Series name (shown in the legend).'),
        data: z.array(z.number()).describe('One value per category, same order.'),
      }),
    )
    .min(1)
    .describe('One or more data series, each with one value per category.'),
})

// ── Map-region (choropleth) requirement + data pass ────────────────────────
//
// The exact mirror of the chart split, for the PRIMARY visual of a map story:
// the outline declares a per-section choropleth REQUIREMENT (what metric, which
// regions — no numbers), and a focused `generateRegions` pass fills the
// per-region values grounded in the sources. Decoupled for the same reason as
// charts: fabricating accurate per-region figures as a byproduct of skeleton
// planning is unreliable.

/**
 * A choropleth REQUIREMENT — what a map section plans to shade, with no values.
 * Custom GeoJSON needs an author-supplied data asset, so generated stories
 * default to `level: "country"` (built-in boundaries, ISO alpha-2 codes).
 */
export const regionRequirementSchema = z.object({
  metric: z
    .string()
    .describe(
      'What each region is shaded by — the choropleth metric, e.g. "press-freedom score (0–100)" ' +
        'or "Muslim share of population (%)". Concrete and grounded in the sources.',
    ),
  level: z
    .enum(['country', 'custom'])
    .describe(
      '"country" shades built-in country boundaries by ISO alpha-2 code — the default for ' +
        'generated stories. "custom" needs an author-supplied geojsonUrl + idProperty.',
    ),
  geojsonUrl: z.string().optional().describe('level: custom only — author-supplied GeoJSON path.'),
  idProperty: z.string().optional().describe('level: custom only — feature id property.'),
  requirement: z
    .string()
    .describe(
      'Exactly which regions to shade and over what range, all from the sources — e.g. "every ' +
        'G20 country by its 2026 RSF score". Concrete; do NOT invent the values here (the data pass does).',
    ),
})

/**
 * The data-only OUTPUT of `generateRegions`: one grounded `{ code, value }` per
 * shaded region. Merged with its requirement (level/geojson/idProperty) and
 * default ramp/legend into a full `MapRegionLayer`.
 */
export const regionDataSchema = z.object({
  items: z
    .array(
      z.object({
        code: z
          .string()
          .describe('ISO 3166-1 alpha-2 (level: country) or the GeoJSON feature id (level: custom).'),
        value: z.number().describe('The choropleth metric for this region, from the sources.'),
        label: z.string().optional().describe('Optional display label (defaults to the region name).'),
      }),
    )
    .min(1)
    .describe('One entry per shaded region — every value grounded in the sources.'),
})

export const imagePromptSchema = z.object({
  section: z.string().describe('The section heading this image belongs to.'),
  prompt: z.string().describe('A vivid, specific image-generation prompt.'),
  aspectRatio: z.enum(ASPECT_RATIOS).describe('Target aspect ratio.'),
})

/**
 * The two passes a section is generated in. The CONTENT pass writes the prose
 * (markdown); the VISUAL pass designs the config `body` given the accepted
 * prose. Splitting them lets an author refine narrative and visuals
 * independently, and keeps each call's schema small. `generatedSectionSchema`
 * is the merged shape the combined `generateSection` wrapper returns.
 */
/** The CONTENT-pass output schema, with `kind` narrowed to the format's allowed kinds. */
export function sectionContentSchemaFor(format: 'deck' | 'map') {
  const paragraphs =
    format === 'map'
      ? z
          .array(z.string())
          .min(1)
          .max(4)
          .describe(
            'Body prose, one string per paragraph — TIGHT beats: 2–4 paragraphs of 20–45 words ' +
              'each, ≤ ~110 words total (the rail card clips on portrait, it does not scroll). ' +
              'Factual magazine register.',
          )
      : z
          .array(z.string())
          .min(1)
          .max(5)
          .describe(
            'Body prose, one string per paragraph — lean panel copy: 30–60 words per paragraph, ' +
              'no padding. Factual magazine register.',
          )
  return z.object({
    heading: z
      .string()
      .describe('Short, specific heading — becomes the markdown ## and the config text anchor.'),
    paragraphs,
    kind: kindField(format),
  })
}

/** Back-compat default (full kind menu). Prefer {@link sectionContentSchemaFor}. */
export const sectionContentSchema = sectionContentSchemaFor('deck')

export const sectionVisualSchema = z.object({
  body: sectionBodySchema.describe(
    'The section VISUAL content: foreground layers (and optional background/map). ' +
      'Omit image/imageGrid layers — request images via imagePrompts instead. ' +
      'A chart layer references a chart id defined in the top-level charts list.',
  ),
})

/**
 * The VISUAL-pass schema, narrowed to the format (and, for maps, the section
 * kind). A MAP section's body is constrained at the provider level so the
 * deck-panel failure mode is unrepresentable: required camera, foreground at
 * most a lone bigStat (no layout/regions), and a required `eyebrow` on hero
 * sections. Deck sections keep the historic full-body shape.
 */
export function sectionVisualSchemaFor(
  format: 'deck' | 'map',
  kind?: string,
  pack: DomainPack = VIZMAYA_PACK,
) {
  if (format !== 'map') {
    // Deck bodies take the pack's vertical layer types in the foreground
    // union; zero extras (vizmaya) is the canonical schema instance. The
    // extended schema VALIDATES the extras at runtime but is declared as the
    // canonical shape — the extras are vertical-module configs the pipeline
    // only ever passes through opaquely.
    if (pack.extraLayerTypes.length === 0) return sectionVisualSchema
    return z.object({
      body: sectionBodySchemaWith(pack.extraLayerTypes.map((t) => t.schema)).describe(
        'The section VISUAL content: foreground layers (and optional background/map). ' +
          'Omit image/imageGrid layers — request images via imagePrompts instead. ' +
          'A chart layer references a chart id defined in the top-level charts list.',
      ),
    }) as unknown as typeof sectionVisualSchema
  }
  const isHero = kind === 'hero' || kind === 'cover' // legacy stubs may still say "cover"
  return z.object({
    body: mapSectionBodySchemaFor({ requireEyebrow: isHero }).describe(
      'The section VISUAL: the map camera (+ pins / choropleth framing). The prose renders in ' +
        'the scroll rail; a planned chart is attached by id automatically — never as a layer.',
    ),
  })
}

// ── Subsection passes (MAP only — the sub-beats of a parent section) ────────

/** The CONTENT-pass output for ONE sub-beat: prose only. The heading is the
 *  planned stub heading (stable anchor) and the kind is the parent's, so the
 *  model emits neither. Same tight length discipline as a map section — each
 *  beat is one snap target. */
export const subsectionContentSchema = z.object({
  paragraphs: z
    .array(z.string())
    .min(1)
    .max(4)
    .describe(
      'Body prose for this beat, one string per paragraph — TIGHT: 1–3 paragraphs of 20–45 ' +
        'words each, ≤ ~90 words total (each beat is one snap; portrait clips, it does not ' +
        'scroll). Factual magazine register.',
    ),
})

/**
 * The VISUAL-pass output for ONE sub-beat: the parts of its camera dive the
 * outline does not plan. Center/zoom come from the planned `geo` and are merged
 * deterministically; the model adds only tilt and the grounded focal pins.
 */
export const subsectionVisualSchema = z.object({
  pitch: z
    .number()
    .optional()
    .describe('Camera tilt in degrees for the dive (0 = top-down; 15–30 adds drama; omit to keep the parent\'s).'),
  bearing: z.number().optional().describe('Camera rotation in degrees. Usually omit.'),
  pins: z
    .array(genPinSchema)
    .max(5)
    .optional()
    .describe(
      'The focal pins for this beat — the cities/sites the prose names, each ' +
        '{ coordinates: [lng, lat], label }. REPLACES the parent\'s pins for this snap. ' +
        'Omit to keep the parent\'s pins.',
    ),
})

export const generatedSectionSchema = sectionContentSchema.merge(sectionVisualSchema)

// ── Step 1: outline (fast — the skeleton, no prose) ────────────────────────

/**
 * The structured geography a MAP section frames. Coordinates here are general
 * geographic knowledge (where a country/region sits), not source data, so the
 * outline may emit them — unlike chart/region VALUES, which a grounded pass
 * fills. `center` is a 2-item array (not a tuple) for provider structured-
 * output compatibility.
 */
export const sectionGeoSchema = z.object({
  focus: z
    .string()
    .describe(
      'The named place this section frames — a region/country/city, e.g. "the Persian Gulf", ' +
        '"Sub-Saharan Africa", "Gujarat\'s coastline".',
    ),
  center: z
    .array(z.number())
    .min(2)
    .max(2)
    .describe('Camera center as [lng, lat] — longitude FIRST (the engine\'s order).'),
  zoom: z
    .number()
    .describe('Camera zoom: ≈1–1.5 world, ≈3 continent, ≈4–5.5 country, 6+ sub-region/city.'),
})

/**
 * A planned sub-beat of a MAP section (the press-freedom pattern): the parent
 * holds the shared map context — camera, choropleth, pin field — and each
 * subsection is its own snap target with its own prose anchor and a camera
 * DIVE within the parent's framing. The parent's prose never renders when
 * subsections exist, so the children must carry all the copy.
 */
export const subsectionStubSchema = z.object({
  heading: z
    .string()
    .describe(
      'Short, specific heading — becomes this beat\'s markdown ## anchor. Must be UNIQUE ' +
        'across the whole story (sections and subsections share one anchor namespace).',
    ),
  intent: z.string().describe("One line on this beat's job within the parent's context."),
  expectedContent: z
    .string()
    .describe(
      'The specific facts, figures, and places this beat must carry — concrete and grounded ' +
        'in the sources.',
    ),
  geo: sectionGeoSchema.describe(
    "The camera DIVE for this beat — a closer framing INSIDE the parent's geography " +
      '(e.g. parent frames the Nordics at z3.4, beats dive to Norway z4.2, the Baltics z4.5). ' +
      "Overrides the parent camera for this snap only.",
  ),
  visual: z
    .string()
    .describe(
      'What this beat marks: the focal pins (which places) and what the dive framing makes ' +
        'visible in the shared choropleth/pin field.',
    ),
})

/** The stub fields every format shares. */
const stubCommon = {
  heading: z
    .string()
    .describe('Short, specific section heading — becomes the markdown ## and config text anchor.'),
  intent: z.string().describe("One line on this section's job in the story."),
  context: z
    .string()
    .describe(
      'How this section connects to the ones around it — what it follows from and what it ' +
        'sets up. The narrative role the writer needs.',
    ),
  expectedContent: z
    .string()
    .describe(
      'The specific facts, figures, and quotes this section must carry — concrete and ' +
        'grounded in the sources, NOT generic. This is what the writer fills the prose with.',
    ),
  chartId: z
    .string()
    .optional()
    .describe('If this section features a chart, the id of a chart from the charts list.'),
}

/**
 * The section-stub schema, narrowed to the format — so a map outline can never
 * plan deck kinds (which suppress the prose rail), never plans a deck `layout`
 * panel over the map, and MUST declare the geography each section frames. The
 * deck variant is unchanged from the historic shape.
 */
export function sectionStubSchemaFor(format: 'deck' | 'map') {
  if (format === 'map') {
    return z.object({
      ...stubCommon,
      heading: z
        .string()
        .describe(
          'Short, specific section heading — becomes the markdown ## and config text anchor. ' +
            'For kind "stat" the heading IS the rendered giant figure, so it must be the number ' +
            'itself (e.g. "18.7 GW", "10 million homes") — never a phrase.',
        ),
      kind: kindField('map'),
      visual: z
        .string()
        .describe(
          'The camera moment this section features: what the framing shows, any focal pins, ' +
            'and what the shaded regions (if any) make visible.',
        ),
      geo: sectionGeoSchema.describe(
        'The geography this section frames — focus + camera center + zoom. REQUIRED on every ' +
          'map section: it is the spine the camera follows through the story.',
      ),
      regionRequirement: regionRequirementSchema
        .optional()
        .describe(
          'If this section shades geography (a choropleth), the region requirement — what ' +
            'metric, which regions. The map carries the data here; a focused pass fills the values. ' +
            'Choropleths shade AREAL units only (countries, states, regions) — cities/towns/sites ' +
            'are pins, never shaded.',
        ),
      subsections: z
        .array(subsectionStubSchema)
        .min(2)
        .max(4)
        .optional()
        .describe(
          'Optional 2–4 sub-beats that explore THIS section\'s shared map context as separate ' +
            'snap targets — use when one data context (its choropleth or pin field) deserves ' +
            'several beats: the camera dives place to place while the shaded data stays. The ' +
            'parent carries the regionRequirement and the wide framing; subsections never ' +
            'carry a regionRequirement. When subsections exist the parent has no prose of its ' +
            'own — the beats carry all the copy.',
        ),
    })
  }
  return z.object({
    ...stubCommon,
    kind: kindField('deck'),
    visual: z
      .string()
      .describe(
        'The visualisation this section features: which foreground layers (bigStat, chart, ' +
          'quote, keyValue, bodyText) and what each shows.',
      ),
    layout: z
      .string()
      .optional()
      .describe(
        'The named foreground layout that frames the visual (e.g. ' +
          'stat-left-chart-right, text-left-chart-right, centered, hero-full-bleed).',
      ),
  })
}

/** Back-compat default (deck shape). Prefer {@link sectionStubSchemaFor}. */
export const sectionStubSchema = sectionStubSchemaFor('deck')

/** The outline schema, with section stubs narrowed to the format. */
export function outlineSchemaFor(format: 'deck' | 'map', pack: DomainPack = VIZMAYA_PACK) {
  return z.object({
    format: z.enum(['deck', 'map']).describe('The story format to produce.'),
    title: z.string().describe('Story headline.'),
    subtitle: z.string().describe('One-line deck/subtitle.'),
    byline: z.string().describe(`Attribution line, e.g. "${pack.bylineExample}".`),
    accentColors: z
      .object({
        accent: z.string().optional().describe('Primary accent hex.'),
        accent2: z.string().optional().describe('Secondary accent hex.'),
      })
      .optional()
      .describe('Optional accent overrides; the engine supplies the rest of the theme.'),
    charts: z
      .array(chartRequirementSchema)
      .describe(
        'Every chart any section references, declared as a REQUIREMENT (id, type, ' +
          'title, what to plot) — no numbers. The data is generated in a later pass.',
      ),
    imagePrompts: z
      .array(imagePromptSchema)
      .describe('Image prompts for sections that want imagery (a sidecar).'),
    sections: z
      .array(sectionStubSchemaFor(format))
      .min(3)
      .max(8)
      .describe('3–8 section stubs that tell the story start to finish.'),
  })
}

/** Back-compat default (deck shape). Prefer {@link outlineSchemaFor}. */
export const outlineSchema = outlineSchemaFor('deck')

export type OutlineOutput = z.infer<typeof outlineSchema>
