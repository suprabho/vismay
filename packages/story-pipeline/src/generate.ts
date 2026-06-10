import { generateStructured } from './ai'
import { normalizeSectionBody } from './vizEngine'
import {
  outlineSchemaFor,
  sectionContentSchemaFor,
  sectionVisualSchema,
  chartDataSchema,
  regionDataSchema,
} from './schema'
import {
  outlineSystem,
  buildOutlinePrompt,
  contentSystem,
  buildContentPrompt,
  visualSystem,
  buildVisualPrompt,
  CHART_SYSTEM,
  buildChartPrompt,
  REGIONS_SYSTEM,
  buildRegionsPrompt,
} from './prompts'
import { buildRegionLayer } from './regions'
import { DEFAULT_THEME } from './defaults'
import { validateStory } from './validate'
import type {
  GeneratedStory,
  GeneratedSection,
  SectionContentDraft,
  SectionContext,
  StoryOutline,
  SectionStub,
  ChartRequirement,
  ChartSpec,
  RegionRequirement,
  RegionData,
  ResearchBrief,
  SourceDoc,
  ComposeAnswers,
  StoryFormat,
  ValidationIssue,
} from './types'

export interface GenerateOptions {
  /** Override the model alias. Defaults to `text.pro`. */
  model?: string
  /** Force the story format; otherwise the brief's suggestion wins. */
  format?: StoryFormat
}

export interface GenerateInput {
  sources: SourceDoc[]
  brief: ResearchBrief
  answers: ComposeAnswers
}

/** kebab-case slug from a title. */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 50) || 'story'
  )
}

function buildFrontmatter(outline: StoryOutline): Record<string, unknown> {
  const colors: Record<string, string> = { ...DEFAULT_THEME.colors }
  if (outline.accentColors?.accent) colors.accent = outline.accentColors.accent
  if (outline.accentColors?.accent2) colors.accent2 = outline.accentColors.accent2
  return {
    title: outline.title,
    subtitle: outline.subtitle,
    byline: outline.byline,
    date: new Date().toISOString().slice(0, 10),
    format: outline.format,
    status: 'draft',
    theme: { colors, fonts: DEFAULT_THEME.fonts },
  }
}

/**
 * Step 1 — the fast outline call. Returns the story skeleton (title, charts,
 * section stubs) without any prose, so it comes back quickly. The format is the
 * caller's choice (the editor's answer), not the model's.
 */
export async function generateOutline(
  input: GenerateInput,
  opts: GenerateOptions & { refine?: { feedback: string; previous: unknown } } = {},
): Promise<StoryOutline> {
  const format = opts.format ?? input.brief.suggestedFormat ?? 'deck'
  const result = await generateStructured({
    model: opts.model,
    system: outlineSystem(format),
    // Format-aware schema: a map outline is narrowed to rail-safe kinds, loses
    // the deck-only `layout`, and must declare each section's `geo`.
    schema: outlineSchemaFor(format),
    prompt: buildOutlinePrompt(input.sources, input.brief, input.answers, opts.refine),
    metadata: { feature: 'story-pipeline-outline', format },
  })
  return toOutline(result, format)
}

/** The schema output, structurally — both format variants of the stub satisfy SectionStub. */
interface OutlineLike extends Omit<StoryOutline, 'format'> {
  format: StoryFormat
}

function toOutline(out: OutlineLike, format: StoryFormat): StoryOutline {
  return {
    format, // force the caller's format
    title: out.title,
    subtitle: out.subtitle,
    byline: out.byline,
    accentColors: out.accentColors,
    charts: out.charts,
    imagePrompts: out.imagePrompts,
    sections: out.sections,
  }
}

/**
 * The chart DATA pass — turn ONE chart REQUIREMENT (from the outline) into a
 * full `ChartSpec` by generating the numeric series grounded in the sources.
 * Decoupled from the outline so chart numbers are produced by a focused call
 * rather than fabricated as a byproduct of skeleton planning. The model emits
 * only `categories` + `series`; the id/title/chartType/axes come from the
 * requirement and are merged in here.
 */
export async function generateChart(
  args: { requirement: ChartRequirement; brief: ResearchBrief; sources: SourceDoc[] },
  opts: { model?: string; refine?: { feedback: string; previous: unknown } } = {},
): Promise<ChartSpec> {
  const data = await generateStructured({
    model: opts.model,
    system: CHART_SYSTEM,
    prompt: buildChartPrompt(args.requirement, args.brief, args.sources, opts.refine),
    schema: chartDataSchema,
    metadata: { feature: 'story-pipeline-chart' },
  })
  const { requirement: _omit, ...meta } = args.requirement
  return { ...meta, categories: data.categories, series: data.series }
}

/**
 * The map-region DATA pass — turn ONE choropleth REQUIREMENT into a full
 * `map.regions` layer by generating the per-region values grounded in the
 * sources. The exact mirror of {@link generateChart}: the model emits only the
 * `{ code, value }` items; the level/geometry come from the requirement and the
 * ramp/legend are built deterministically by {@link buildRegionLayer}. In a map
 * story the polygons carry the numbers, so this is the section's primary data.
 */
export async function generateRegions(
  args: { requirement: RegionRequirement; brief: ResearchBrief; sources: SourceDoc[] },
  opts: { model?: string; refine?: { feedback: string; previous: unknown } } = {},
): Promise<Record<string, unknown>> {
  const data: RegionData = await generateStructured({
    model: opts.model,
    system: REGIONS_SYSTEM,
    prompt: buildRegionsPrompt(args.requirement, args.brief, args.sources, opts.refine),
    schema: regionDataSchema,
    metadata: { feature: 'story-pipeline-regions' },
  })
  return buildRegionLayer(args.requirement, data)
}

/**
 * Merge a generated choropleth into a section body's `map.regions`, creating the
 * `map` block if the visual pass didn't emit one. The visual pass frames the
 * camera; the region values are filled by `generateRegions` and merged here —
 * the model never authors the per-region numbers. Exported so split-pass callers
 * (the canvas compose section route) can run the same merge as `generateSection`.
 */
export function injectRegions(
  body: Record<string, unknown>,
  regions: Record<string, unknown>,
): Record<string, unknown> {
  const map =
    body.map && typeof body.map === 'object' && !Array.isArray(body.map)
      ? (body.map as Record<string, unknown>)
      : {}
  return { ...body, map: { ...map, regions } }
}

/** Per-pass options for the split section generators. */
export interface SectionGenOptions {
  /** Override the model alias. Defaults to `text.pro`. */
  model?: string
  /** Refine loop: feedback on a prior draft to revise instead of restart. */
  refine?: { feedback: string; previous: unknown }
}

/**
 * Step 2a — the CONTENT pass: generate ONE section's prose (heading +
 * paragraphs + kind), no visual body. In `outline` context the planned stub
 * heading is kept stable so the markdown anchor never drifts; in `brief`
 * context the model chooses the heading.
 */
export async function generateSectionContent(
  ctx: SectionContext,
  opts: SectionGenOptions = {},
): Promise<SectionContentDraft> {
  const format = ctx.source === 'outline' ? ctx.outline.format : ctx.format
  const result = await generateStructured({
    model: opts.model,
    system: contentSystem(format),
    prompt: buildContentPrompt(ctx, opts.refine),
    schema: sectionContentSchemaFor(format),
    metadata: { feature: 'story-pipeline-section-content' },
  })
  return {
    heading: ctx.source === 'outline' ? ctx.stub.heading : result.heading,
    paragraphs: result.paragraphs,
    kind: result.kind,
  }
}

/**
 * Step 2b — the VISUAL pass: design ONE section's config `body`, given the
 * already-accepted prose. The body is constrained by viz-engine's own layer
 * schemas, so it can never carry malformed visual config.
 */
export async function generateSectionVisual(
  ctx: SectionContext,
  content: SectionContentDraft,
  opts: SectionGenOptions = {},
): Promise<{ body: Record<string, unknown> }> {
  const result = await generateStructured({
    model: opts.model,
    system: visualSystem(ctx.source === 'outline' ? ctx.outline.format : ctx.format),
    prompt: buildVisualPrompt(ctx, content, opts.refine),
    schema: sectionVisualSchema,
    metadata: { feature: 'story-pipeline-section-visual' },
  })
  return { body: normalizeSectionBody(result.body) }
}

/**
 * Step 2 (combined) — run the CONTENT then VISUAL pass and merge. The
 * canonical single-call section generator: the offline harness, `generateStory`,
 * and the fs compose routes use this. Pass `refine` to revise a prior section.
 */
export async function generateSection(
  args: {
    outline: StoryOutline
    stub: SectionStub
    sources: SourceDoc[]
    brief: ResearchBrief
    answers: ComposeAnswers
    refine?: { feedback: string; previous: GeneratedSection }
  },
  opts: GenerateOptions = {},
): Promise<GeneratedSection> {
  const ctx: SectionContext = {
    source: 'outline',
    outline: args.outline,
    stub: args.stub,
    sources: args.sources,
    brief: args.brief,
    answers: args.answers,
  }
  const content = await generateSectionContent(ctx, {
    model: opts.model,
    refine: args.refine
      ? {
          feedback: args.refine.feedback,
          previous: {
            heading: args.refine.previous.heading,
            paragraphs: args.refine.previous.paragraphs,
            kind: args.refine.previous.kind,
          },
        }
      : undefined,
  })
  const visual = await generateSectionVisual(ctx, content, {
    model: opts.model,
    refine: args.refine
      ? { feedback: args.refine.feedback, previous: { body: args.refine.previous.body } }
      : undefined,
  })
  let body = visual.body
  // MAP choropleth: fill this section's per-region values in a focused,
  // source-grounded pass and merge them into body.map.regions. The visual pass
  // frames the camera; it does NOT author the numbers (the chart-data split,
  // applied to maps). Only runs for map sections that declared a requirement.
  if (args.outline.format === 'map' && args.stub.regionRequirement) {
    const regions = await generateRegions(
      { requirement: args.stub.regionRequirement, brief: args.brief, sources: args.sources },
      { model: opts.model },
    )
    body = injectRegions(body, regions)
  }
  return { ...content, body }
}

/**
 * Compose an outline + its generated sections into a full story. `charts` are
 * the data-bearing `ChartSpec`s produced by `generateChart` (the outline only
 * holds requirements), defaulting to none.
 */
export function assembleStory(
  outline: StoryOutline,
  sections: GeneratedSection[],
  charts: ChartSpec[] = [],
): GeneratedStory {
  return {
    slug: slugify(outline.title),
    format: outline.format,
    frontmatter: buildFrontmatter(outline),
    sections,
    charts,
    imagePrompts: outline.imagePrompts,
  }
}

/**
 * Convenience: run the whole step-wise flow (outline → each section) and
 * validate. Used by the offline verify harness; the streaming route drives the
 * same steps directly so it can emit progress between them.
 */
export async function generateStory(
  input: GenerateInput,
  opts: GenerateOptions = {},
): Promise<{ story: GeneratedStory; issues: ValidationIssue[] }> {
  const outline = await generateOutline(input, opts)
  // Chart DATA pass: turn each outline chart requirement into a full ChartSpec
  // grounded in the sources (the outline only declares requirements).
  const charts: ChartSpec[] = []
  for (const requirement of outline.charts) {
    // eslint-disable-next-line no-await-in-loop
    charts.push(
      await generateChart(
        { requirement, brief: input.brief, sources: input.sources },
        { model: opts.model },
      ),
    )
  }
  const sections: GeneratedSection[] = []
  for (const stub of outline.sections) {
    // eslint-disable-next-line no-await-in-loop
    sections.push(
      await generateSection(
        { outline, stub, sources: input.sources, brief: input.brief, answers: input.answers },
        opts,
      ),
    )
  }
  const story = assembleStory(outline, sections, charts)
  return { story, issues: validateStory(story) }
}
