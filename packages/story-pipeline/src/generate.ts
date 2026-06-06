import { generateStructured } from './ai'
import { normalizeSectionBody } from './vizEngine'
import { outlineSchema, generatedSectionSchema, type OutlineOutput } from './schema'
import {
  outlineSystem,
  buildOutlinePrompt,
  sectionSystem,
  buildSectionPrompt,
} from './prompts'
import { DEFAULT_THEME } from './defaults'
import { validateStory } from './validate'
import type {
  GeneratedStory,
  GeneratedSection,
  StoryOutline,
  SectionStub,
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
  opts: GenerateOptions = {},
): Promise<StoryOutline> {
  const format = opts.format ?? input.brief.suggestedFormat ?? 'deck'
  const result = await generateStructured({
    model: opts.model,
    system: outlineSystem(format),
    prompt: buildOutlinePrompt(input.sources, input.brief, input.answers),
    schema: outlineSchema,
    metadata: { feature: 'story-pipeline-outline', format },
  })
  return toOutline(result, format)
}

function toOutline(out: OutlineOutput, format: StoryFormat): StoryOutline {
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
 * Step 2 — generate ONE section from its stub. Short call (one section's prose +
 * visual), so it never trips the gateway header timeout. Pass `refine` to
 * regenerate a section against editor feedback.
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
  const { outline, stub, sources, brief, answers, refine } = args
  const result = await generateStructured({
    model: opts.model,
    system: sectionSystem(outline.format),
    prompt: buildSectionPrompt(outline, stub, sources, brief, answers, refine),
    schema: generatedSectionSchema,
    metadata: { feature: 'story-pipeline-section', heading: stub.heading },
  })
  return {
    // Keep the planned heading so the markdown anchor stays stable across
    // regenerations (the config `text` is written from this exact string).
    heading: stub.heading,
    paragraphs: result.paragraphs,
    kind: result.kind,
    body: normalizeSectionBody(result.body),
  }
}

/** Compose an outline + its generated sections into a full story. */
export function assembleStory(
  outline: StoryOutline,
  sections: GeneratedSection[],
): GeneratedStory {
  return {
    slug: slugify(outline.title),
    format: outline.format,
    frontmatter: buildFrontmatter(outline),
    sections,
    charts: outline.charts,
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
  const story = assembleStory(outline, sections)
  return { story, issues: validateStory(story) }
}
