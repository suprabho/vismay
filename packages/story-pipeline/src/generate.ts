import { generateStructured } from './ai'
import { normalizeSectionBody } from './vizEngine'
import {
  outlineSchemaFor,
  sectionStubSchemaFor,
  sectionContentSchemaFor,
  sectionVisualSchemaFor,
  subsectionContentSchema,
  subsectionVisualSchema,
  chartDataSchema,
  chartRequirementSchema,
  regionDataSchema,
} from './schema'
import {
  outlineSystem,
  buildOutlinePrompt,
  outlineSectionSystem,
  buildOutlineSectionPrompt,
  contentSystem,
  buildContentPrompt,
  visualSystem,
  buildVisualPrompt,
  subsectionContentSystem,
  buildSubsectionContentPrompt,
  subsectionVisualSystem,
  buildSubsectionVisualPrompt,
  chartSystem,
  buildChartPrompt,
  chartRequirementSystem,
  buildChartRequirementPrompt,
  regionsSystem,
  buildRegionsPrompt,
} from './prompts'
import { VIZMAYA_PACK } from './packs/vizmaya'
import type { DomainPack } from './packs/types'
import { buildRegionLayer } from './regions'
import { completeCoverBody, isDeckCover } from './cover'
import { completeMapHero, completeMapHeroProse } from './mapHero'
import { lintOutline, lintSectionBody, formatLintIssue } from './lintLayout'
import { DEFAULT_THEME } from './defaults'
import { validateStory } from './validate'
import type {
  GeneratedStory,
  GeneratedSection,
  GeneratedSubsection,
  SectionContentDraft,
  SectionContext,
  StoryOutline,
  SectionStub,
  SubsectionStub,
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
  /** The vertical's editorial desk (voice + vertical layer menu). Defaults to vizmaya. */
  pack?: DomainPack
  /** Pre-resolved data for pack `hydrate` steps (e.g. f1 driver headshots). See
   *  {@link SectionGenOptions.hydrationDeps}. */
  hydrationDeps?: Record<string, unknown>
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
  const pack = opts.pack ?? VIZMAYA_PACK
  const run = (refine?: { feedback: string; previous: unknown }) =>
    generateStructured({
      model: opts.model,
      system: outlineSystem(format, pack),
      // Format-aware schema: a map outline is narrowed to rail-safe kinds, loses
      // the deck-only `layout`, and must declare each section's `geo`.
      schema: outlineSchemaFor(format, pack),
      prompt: buildOutlinePrompt(input.sources, input.brief, input.answers, refine),
      metadata: { feature: 'story-pipeline-outline', format },
    })
  const result = await run(opts.refine)
  const outline = toOutline(result, format)
  // Structural lint + ONE corrective retry. The lint rules (hero opener, map
  // stat second, numeric stat headings, geo on every map section, …) are
  // prompt guidance first — this catches the misses instead of trusting them.
  const issues = lintOutline(outline)
  if (issues.length === 0) return outline
  const retried = toOutline(
    await run({
      feedback:
        `The outline has structural problems — fix exactly these, keeping everything ` +
        `else (headings, charts, prose plans) as it was:\n` +
        issues.map(formatLintIssue).join('\n'),
      previous: result,
    }),
    format,
  )
  // Keep the retry only if it actually improved.
  return lintOutline(retried).length <= issues.length ? retried : outline
}

/**
 * Regenerate ONE outline section in place, or draft a NEW one from an author
 * prompt — the per-slide affordances of the compose outline tab. Decoupled from
 * {@link generateOutline} so re-planning a single beat (or slotting in a new
 * one) doesn't churn the rest of the deck. The caller supplies the surrounding
 * sections (the target excluded for a regenerate) and the outline's charts for
 * context; this returns a single {@link SectionStub} in the format's shape. The
 * caller owns insertion, heading de-duplication, and persistence.
 */
export async function generateOutlineSection(
  input: GenerateInput,
  args: {
    mode: 'regenerate' | 'add'
    /** Surrounding sections for context (exclude the target on a regenerate). */
    outline: SectionStub[]
    /** Chart requirements the new/regenerated section may reference by id. */
    charts: ChartRequirement[]
    /** The section being replaced (regenerate only). */
    target?: SectionStub
    /** 1-based slot the added section will occupy (add only). */
    position?: number
    /** Author steer — feedback when regenerating, the prompt when adding. */
    instruction?: string
  },
  opts: GenerateOptions = {},
): Promise<SectionStub> {
  const format = opts.format ?? input.brief.suggestedFormat ?? 'deck'
  const pack = opts.pack ?? VIZMAYA_PACK
  const result = await generateStructured({
    model: opts.model,
    system: outlineSectionSystem(format, pack),
    schema: sectionStubSchemaFor(format),
    prompt: buildOutlineSectionPrompt(input.sources, input.brief, input.answers, {
      mode: args.mode,
      outline: args.outline,
      charts: args.charts,
      target: args.target,
      position: args.position,
      instruction: args.instruction,
    }),
    metadata: { feature: 'story-pipeline-outline-section', format },
  })
  return result as SectionStub
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
 * full `ChartSpec` by generating the source-grounded data. Decoupled from the
 * outline so chart data is produced by a focused call rather than fabricated as
 * a byproduct of skeleton planning. The model emits a compact flint tabular spec
 * (columns + rows + channel encodings); the id/title/chartType/axes come from
 * the requirement and are merged in here. `buildEChartsOption` compiles the
 * result to an ECharts option via flint's `assembleECharts`.
 */
export async function generateChart(
  args: { requirement: ChartRequirement; brief: ResearchBrief; sources: SourceDoc[] },
  opts: { model?: string; pack?: DomainPack; refine?: { feedback: string; previous: unknown } } = {},
): Promise<ChartSpec> {
  const data = await generateStructured({
    model: opts.model,
    system: chartSystem(opts.pack),
    prompt: buildChartPrompt(args.requirement, args.brief, args.sources, opts.refine),
    schema: chartDataSchema,
    metadata: { feature: 'story-pipeline-chart' },
  })
  const { requirement: _omit, ...meta } = args.requirement
  return { ...meta, columns: data.columns, rows: data.rows, encodings: data.encodings }
}

/**
 * The chart REQUIREMENT (re-)plan pass — re-plan ONE chart's PROMPT (its
 * chartType, title, axes, and the precise "what to plot" requirement), grounded
 * in the brief + chosen angle + sources, optionally steered by an author note.
 * This is the plan, NOT the data: {@link generateChart} still produces the
 * figures afterwards. The `id` is preserved so any layer referencing this chart
 * stays valid. Lets an author refine a single chart's plan without regenerating
 * the whole outline.
 */
export async function generateChartRequirement(
  args: { requirement: ChartRequirement; brief: ResearchBrief; sources: SourceDoc[] },
  opts: { model?: string; pack?: DomainPack; feedback?: string } = {},
): Promise<ChartRequirement> {
  const out = await generateStructured({
    model: opts.model,
    system: chartRequirementSystem(opts.pack),
    prompt: buildChartRequirementPrompt(args.requirement, args.brief, args.sources, opts.feedback),
    schema: chartRequirementSchema,
    metadata: { feature: 'story-pipeline-chart-requirement' },
  })
  // Force the original id — layers reference this chart by id, so a model that
  // ignores the "keep the id" instruction can't orphan them.
  return { ...out, id: args.requirement.id }
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
  opts: { model?: string; pack?: DomainPack; refine?: { feedback: string; previous: unknown } } = {},
): Promise<Record<string, unknown>> {
  const data: RegionData = await generateStructured({
    model: opts.model,
    system: regionsSystem(opts.pack),
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
  /** The vertical's editorial desk (voice + vertical layer menu). Defaults to vizmaya. */
  pack?: DomainPack
  /** Refine loop: feedback on a prior draft to revise instead of restart. */
  refine?: { feedback: string; previous: unknown }
  /**
   * Pre-resolved data for pack `hydrate` steps — the pipeline does no I/O. The
   * caller fetches vertical data (e.g. f1 driver headshots from the DB) and
   * passes it here; each pack hydrate fn reads what it needs by a well-known key
   * (f1 reads `f1DriverHeadshots`).
   */
  hydrationDeps?: Record<string, unknown>
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
    system: contentSystem(format, opts.pack),
    prompt: buildContentPrompt(ctx, opts.refine),
    schema: sectionContentSchemaFor(format),
    metadata: { feature: 'story-pipeline-section-content' },
  })
  // Map heroes carry their dek in the markdown as ONE `*italic*` standfirst
  // (the extractHeroBits convention) — guaranteed in code, not just prompted.
  const isMapHero =
    format === 'map' && (result.kind === 'hero' || result.kind === 'cover')
  return {
    heading: ctx.source === 'outline' ? ctx.stub.heading : result.heading,
    paragraphs: isMapHero ? completeMapHeroProse(result.paragraphs) : result.paragraphs,
    kind: result.kind,
  }
}

/**
 * Apply each pack layer type's `hydrate` to matching layers in a finalized
 * section body — stamping app-supplied fields (e.g. f1 constructor colours) the
 * model was told to omit, back from the ids it emitted. Walks the normalized
 * `foreground` shape: a single layer object, a flat array, or `{ regions }`.
 */
function hydratePackLayers(
  body: Record<string, unknown>,
  pack: DomainPack,
  deps?: Record<string, unknown>,
): Record<string, unknown> {
  const hydrators = new Map(
    pack.extraLayerTypes.filter((t) => t.hydrate).map((t) => [t.type, t.hydrate!] as const),
  )
  if (hydrators.size === 0 || !body.foreground) return body

  const applyOne = (layer: unknown): unknown => {
    if (!layer || typeof layer !== 'object' || Array.isArray(layer)) return layer
    const type = (layer as { type?: unknown }).type
    const h = typeof type === 'string' ? hydrators.get(type) : undefined
    return h ? h(layer as Record<string, unknown>, deps) : layer
  }

  const fg = body.foreground
  let next: unknown
  if (Array.isArray(fg)) {
    next = fg.map(applyOne)
  } else if (fg && typeof fg === 'object' && 'regions' in fg) {
    const src = (fg as { regions?: Record<string, unknown> }).regions ?? {}
    const regions: Record<string, unknown> = {}
    for (const [name, layers] of Object.entries(src)) {
      regions[name] = Array.isArray(layers) ? layers.map(applyOne) : applyOne(layers)
    }
    next = { ...(fg as object), regions }
  } else {
    next = applyOne(fg)
  }
  return { ...body, foreground: next }
}

/**
 * Step 2b — the VISUAL pass: design ONE section's config `body`, given the
 * already-accepted prose. The body is constrained by viz-engine's own layer
 * schemas — and for MAP sections by the narrowed map body schema (required
 * camera, no deck panels, eyebrow on heroes) — so it can never carry malformed
 * or format-breaking visual config.
 */
export async function generateSectionVisual(
  ctx: SectionContext,
  content: SectionContentDraft,
  opts: SectionGenOptions = {},
): Promise<{ body: Record<string, unknown> }> {
  const format = ctx.source === 'outline' ? ctx.outline.format : ctx.format
  const pack = opts.pack ?? VIZMAYA_PACK
  const run = (refine?: { feedback: string; previous: unknown }) =>
    generateStructured({
      model: opts.model,
      system: visualSystem(format, pack),
      prompt: buildVisualPrompt(ctx, content, refine),
      schema: sectionVisualSchemaFor(format, content.kind, pack),
      metadata: { feature: 'story-pipeline-section-visual' },
    })
  let result = await run(opts.refine)
  let body = normalizeSectionBody(result.body)
  // Placement lint + ONE corrective retry: dropped regions / stacked layers
  // (deck bodies — the map schema makes these unrepresentable).
  const extraTypes = pack.extraLayerTypes.map((t) => t.type)
  const issues = lintSectionBody(body, content.heading, { extraTypes })
  if (issues.length > 0) {
    result = await run({
      feedback:
        `The visual has layout placement problems — fix exactly these, keeping the ` +
        `content (stats, charts, copy) as it was:\n` +
        issues.map(formatLintIssue).join('\n'),
      previous: { body: result.body },
    })
    body = normalizeSectionBody(result.body)
  }
  // Deck covers are completed deterministically (section-root layout, display
  // heading, transparent panel) — the model only authors eyebrow/dek. The hero
  // image is attached where the real story slug is known (serialize / routes).
  if (isDeckCover(format, content.kind)) {
    body = completeCoverBody(body, { heading: content.heading })
  }
  if (format === 'map') {
    // A planned chart is attached BY ID at the section level (the kashmir
    // `chart: data:<id>` rail treatment) — the model never authors chart
    // placement on a map, so it can't reach for a deck panel to hold one.
    if (ctx.source === 'outline' && ctx.stub.chartId) {
      body = { ...body, chart: `data:${ctx.stub.chartId}` }
    }
    // Map heroes are completed deterministically (pitch/opacity/pulse pin,
    // camera fallback from the planned geo, no foreground) — see mapHero.ts.
    if (content.kind === 'hero' || content.kind === 'cover') {
      body = completeMapHero(body, {
        geo: ctx.source === 'outline' ? ctx.stub.geo : undefined,
      })
    }
  }
  // Pack hydration — stamp app-supplied fields the model was told to omit (f1
  // constructor colours from the static palette; driver headshots from the
  // caller-resolved DB map) onto matching vertical layers.
  body = hydratePackLayers(body, pack, opts.hydrationDeps)
  return { body }
}

/**
 * Subsection CONTENT pass — the prose for ONE sub-beat of a map section. The
 * heading is the planned stub heading (stable markdown anchor); the model
 * emits only the paragraphs, under the same tight length discipline as a map
 * section (each beat is one snap target).
 */
export async function generateSubsectionContent(
  ctx: SectionContext,
  parent: SectionStub,
  sub: SubsectionStub,
  opts: SectionGenOptions = {},
): Promise<{ heading: string; paragraphs: string[] }> {
  const result = await generateStructured({
    model: opts.model,
    system: subsectionContentSystem(opts.pack),
    prompt: buildSubsectionContentPrompt(ctx, parent, sub, opts.refine),
    schema: subsectionContentSchema,
    metadata: { feature: 'story-pipeline-subsection-content' },
  })
  return { heading: sub.heading, paragraphs: result.paragraphs }
}

/**
 * Subsection VISUAL pass — the camera dive's unplanned parts (tilt + grounded
 * focal pins). Center/zoom come from the planned `geo` and are merged here
 * deterministically, mirroring how chart/region data passes keep the model
 * away from what the plan already fixes. Returns the engine's
 * `SubsectionMapOverride` fields (`map` on a subsection config entry).
 */
export async function generateSubsectionVisual(
  ctx: SectionContext,
  parent: SectionStub,
  sub: SubsectionStub,
  content: { paragraphs: string[] },
  opts: SectionGenOptions = {},
): Promise<Record<string, unknown>> {
  const result = await generateStructured({
    model: opts.model,
    system: subsectionVisualSystem(opts.pack),
    prompt: buildSubsectionVisualPrompt(ctx, parent, sub, content, opts.refine),
    schema: subsectionVisualSchema,
    metadata: { feature: 'story-pipeline-subsection-visual' },
  })
  const map: Record<string, unknown> = {}
  if (sub.geo?.center) map.center = sub.geo.center
  if (sub.geo?.zoom != null) map.zoom = sub.geo.zoom
  if (result.pitch != null) map.pitch = result.pitch
  if (result.bearing != null) map.bearing = result.bearing
  if (result.pins?.length) map.pins = result.pins
  return map
}

/**
 * Generate every sub-beat of a parent stub: per-sub CONTENT then VISUAL.
 * Sequential on purpose — each beat's prose should flow from the previous one.
 */
export async function generateSubsections(
  ctx: SectionContext,
  parent: SectionStub,
  opts: SectionGenOptions = {},
): Promise<GeneratedSubsection[]> {
  const subs: GeneratedSubsection[] = []
  for (const sub of parent.subsections ?? []) {
    // eslint-disable-next-line no-await-in-loop
    const content = await generateSubsectionContent(ctx, parent, sub, { model: opts.model, pack: opts.pack })
    // eslint-disable-next-line no-await-in-loop
    const map = await generateSubsectionVisual(ctx, parent, sub, content, { model: opts.model, pack: opts.pack })
    subs.push({
      heading: content.heading,
      paragraphs: content.paragraphs,
      ...(Object.keys(map).length ? { map } : {}),
    })
  }
  return subs
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
  // A parent with subsections has no prose of its own (the engine ignores it —
  // the beats carry all the copy), so the parent CONTENT pass is skipped.
  const hasSubs = args.outline.format === 'map' && !!args.stub.subsections?.length
  const content = hasSubs
    ? { heading: args.stub.heading, paragraphs: [], kind: args.stub.kind || 'text' }
    : await generateSectionContent(ctx, {
        model: opts.model,
        pack: opts.pack,
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
    pack: opts.pack,
    hydrationDeps: opts.hydrationDeps,
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
      { model: opts.model, pack: opts.pack },
    )
    body = injectRegions(body, regions)
  }
  if (!hasSubs) return { ...content, body }
  const subsections = await generateSubsections(ctx, args.stub, { model: opts.model, pack: opts.pack })
  return { ...content, body, subsections }
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
        { model: opts.model, pack: opts.pack },
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
  return { story, issues: validateStory(story, { pack: opts.pack }) }
}
