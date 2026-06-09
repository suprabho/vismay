import { z } from 'zod'
import { sectionBodySchema } from './vizEngine'

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
export const sectionContentSchema = z.object({
  heading: z
    .string()
    .describe('Short, specific heading — becomes the markdown ## and the config text anchor.'),
  paragraphs: z
    .array(z.string())
    .describe('Body prose, one string per paragraph (factual magazine register).'),
  kind: z.enum(SECTION_KINDS).describe('The section kind.'),
})

export const sectionVisualSchema = z.object({
  body: sectionBodySchema.describe(
    'The section VISUAL content: foreground layers (and optional background/map). ' +
      'Omit image/imageGrid layers — request images via imagePrompts instead. ' +
      'A chart layer references a chart id defined in the top-level charts list.',
  ),
})

export const generatedSectionSchema = sectionContentSchema.merge(sectionVisualSchema)

// ── Step 1: outline (fast — the skeleton, no prose) ────────────────────────

export const sectionStubSchema = z.object({
  heading: z
    .string()
    .describe('Short, specific section heading — becomes the markdown ## and config text anchor.'),
  kind: z.enum(SECTION_KINDS).describe('The section kind.'),
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
  visual: z
    .string()
    .describe(
      'The visualisation this section features: for a deck, which foreground layers ' +
        '(bigStat, chart, quote, keyValue, bodyText) and what each shows; for a map, the ' +
        'camera moment (where it sits, what it marks).',
    ),
  layout: z
    .string()
    .optional()
    .describe(
      'Deck only: the named foreground layout that frames the visual (e.g. ' +
        'stat-left-chart-right, text-left-chart-right, centered, hero-full-bleed).',
    ),
  chartId: z
    .string()
    .optional()
    .describe('If this section features a chart, the id of a chart from the charts list.'),
  regionRequirement: regionRequirementSchema
    .optional()
    .describe(
      'MAP only: if this section shades geography (a choropleth), the region requirement — what ' +
        'metric, which regions. The map carries the data here; a focused pass fills the values.',
    ),
})

export const outlineSchema = z.object({
  format: z.enum(['deck', 'map']).describe('The story format to produce.'),
  title: z.string().describe('Story headline.'),
  subtitle: z.string().describe('One-line deck/subtitle.'),
  byline: z.string().describe('Attribution line, e.g. "By the Vizmaya desk".'),
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
    .array(sectionStubSchema)
    .min(3)
    .max(8)
    .describe('3–8 section stubs that tell the story start to finish.'),
})

export type OutlineOutput = z.infer<typeof outlineSchema>
