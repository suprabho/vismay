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

export const imagePromptSchema = z.object({
  section: z.string().describe('The section heading this image belongs to.'),
  prompt: z.string().describe('A vivid, specific image-generation prompt.'),
  aspectRatio: z.enum(ASPECT_RATIOS).describe('Target aspect ratio.'),
})

export const generatedSectionSchema = z.object({
  heading: z
    .string()
    .describe('Short, specific heading — becomes the markdown ## and the config text anchor.'),
  paragraphs: z
    .array(z.string())
    .describe('Body prose, one string per paragraph (factual magazine register).'),
  kind: z.enum(SECTION_KINDS).describe('The section kind.'),
  body: sectionBodySchema.describe(
    'The section VISUAL content: foreground layers (and optional background/map). ' +
      'Omit image/imageGrid layers — request images via imagePrompts instead. ' +
      'A chart layer references a chart id defined in the top-level charts list.',
  ),
})

export const storyGenSchema = z.object({
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
  sections: z
    .array(generatedSectionSchema)
    .min(3)
    .max(8)
    .describe('3–8 sections that tell the story start to finish.'),
  charts: z
    .array(chartSpecSchema)
    .describe('Every chart referenced by a chart layer, by id. Empty if none.'),
  imagePrompts: z
    .array(imagePromptSchema)
    .describe('Image prompts for sections that want imagery (a sidecar, not wired in yet).'),
})

export type StoryGenOutput = z.infer<typeof storyGenSchema>
