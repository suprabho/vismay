import { generateText } from '@vismay/ai-gateway'
import { normalizeSectionBody } from './vizEngine'
import { storyGenSchema, type StoryGenOutput } from './schema'
import { generateSystem, buildGeneratePrompt } from './prompts'
import { DEFAULT_THEME } from './defaults'
import { validateStory } from './validate'
import type {
  GeneratedStory,
  GeneratedSection,
  ResearchBrief,
  SourceDoc,
  ComposeAnswers,
  StoryFormat,
  ValidationIssue,
} from './types'

export interface GenerateOptions {
  /** Override the model alias. Defaults to `text.pro`. */
  model?: string
  /** Force the story format; otherwise the brief's suggestion (and the editor's answers) win. */
  format?: StoryFormat
  /** Validate + re-prompt once on failure (default true). */
  repair?: boolean
}

export interface GenerateInput {
  sources: SourceDoc[]
  brief: ResearchBrief
  answers: ComposeAnswers
}

/** kebab-case slug from a title, prefixed so generated stories are easy to spot. */
function slugify(title: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 50) || 'story'
  return base
}

function buildFrontmatter(out: StoryGenOutput, format: StoryFormat): Record<string, unknown> {
  const colors: Record<string, string> = { ...DEFAULT_THEME.colors }
  if (out.accentColors?.accent) colors.accent = out.accentColors.accent
  if (out.accentColors?.accent2) colors.accent2 = out.accentColors.accent2
  return {
    title: out.title,
    subtitle: out.subtitle,
    byline: out.byline,
    date: new Date().toISOString().slice(0, 10),
    format,
    status: 'draft',
    theme: { colors, fonts: DEFAULT_THEME.fonts },
  }
}

function toGeneratedStory(out: StoryGenOutput, format: StoryFormat): GeneratedStory {
  const sections: GeneratedSection[] = out.sections.map((s) => ({
    heading: s.heading,
    paragraphs: s.paragraphs,
    kind: s.kind,
    body: normalizeSectionBody(s.body),
  }))
  return {
    slug: slugify(out.title),
    format,
    frontmatter: buildFrontmatter(out, format),
    sections,
    charts: out.charts,
    imagePrompts: out.imagePrompts,
  }
}

/** Render validation issues as a corrective instruction for the repair pass. */
function repairNote(issues: ValidationIssue[]): string {
  const lines = issues.map((i) => {
    const where = [i.section, i.layer].filter(Boolean).join(' / ')
    return `- ${where ? `[${where}] ` : ''}${i.message}`
  })
  return (
    `Your previous draft had these validation problems. Fix ONLY these and keep the rest:\n` +
    lines.join('\n')
  )
}

/**
 * Phase 2 — generate the full story from sources + brief + the editor's
 * answers. The model fills `storyGenSchema` (section bodies constrained by
 * viz-engine's own layer schemas), the result is normalised into engine config,
 * validated, and — on failure — regenerated once with the issues fed back.
 */
export async function generateStory(
  input: GenerateInput,
  opts: GenerateOptions = {},
): Promise<{ story: GeneratedStory; issues: ValidationIssue[] }> {
  const format = opts.format ?? input.brief.suggestedFormat ?? 'deck'
  const model = opts.model ?? 'text.pro'
  const system = generateSystem(format)
  const basePrompt = buildGeneratePrompt(input.sources, input.brief, input.answers)

  let prompt = basePrompt
  let story: GeneratedStory | null = null
  let issues: ValidationIssue[] = []
  const maxAttempts = opts.repair === false ? 1 : 2

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { result } = await generateText({
      model,
      system,
      prompt,
      schema: storyGenSchema,
      metadata: { feature: 'story-pipeline-generate', format, attempt: String(attempt) },
    })
    story = toGeneratedStory(result, format)
    issues = validateStory(story)
    if (issues.length === 0) break
    // Re-prompt once with the concrete problems appended.
    prompt = `${basePrompt}\n\n${repairNote(issues)}`
  }

  // story is always assigned (the loop runs at least once).
  return { story: story as GeneratedStory, issues }
}
