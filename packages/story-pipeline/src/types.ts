/**
 * Core data contracts for the sources → research → render pipeline.
 *
 * These are the plain TypeScript shapes the pipeline passes around. The zod
 * schemas that constrain the two LLM calls live in `schema.ts` and are derived
 * to match these (the section `body` reuses viz-engine's own layer schemas).
 */

export type StoryFormat = 'deck' | 'map'

export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4'

/** One ingested source — a fetched link or an uploaded file, normalised to text. */
export interface SourceDoc {
  /** The URL (links), filename (files), or a label (pasted text) the text came from. */
  origin: string
  kind: 'link' | 'file' | 'text'
  title: string
  byline?: string
  /** Clean, light-markdown body. Treat as untrusted prose, not validated format. */
  body: string
  /** Tables detected during extraction (csv, or tables lifted from a doc). */
  tables?: Array<{ headers: string[]; rows: string[][] }>
}

/** A question the agent needs answered before it can generate the story. */
export interface ClarifyingQuestion {
  /** Stable id the answer is keyed by. */
  id: string
  question: string
  /** Why the agent is asking — shown under the question. */
  why?: string
  /** `choice` renders radio options; `text` renders a free-text input. */
  kind: 'choice' | 'text'
  /** Present for `choice` questions. */
  options?: string[]
}

/** The Phase-1 research output: a brief plus the human-gate questions. */
export interface ResearchBrief {
  summary: string
  keyFacts: string[]
  entities: string[]
  /** The format the agent thinks fits best; the user can override via a question. */
  suggestedFormat: StoryFormat
  candidateAngles: string[]
  questions: ClarifyingQuestion[]
}

/** The user's answers to the clarifying questions: `{ [questionId]: answer }`. */
export type ComposeAnswers = Record<string, string>

/** One angle the story could take — the human gate in the canvas compose flow. */
export interface StoryAngle {
  /** Stable id the chosen angle is referenced by. */
  id: string
  title: string
  thesis: string
  rationale: string
}

/** The angles-stage output: a brief plus the rich angles to choose between. */
export interface AnglesBrief {
  summary: string
  keyFacts: string[]
  entities: string[]
  suggestedFormat: StoryFormat
  angles: StoryAngle[]
}

/**
 * A simplified chart spec the model emits. Deterministically expanded into a
 * full ECharts option by `buildEChartsOption` — keeps the structured-output
 * schema clean (no arbitrary nested option objects).
 */
export interface ChartSpec {
  /** Referenced by a `{ type: 'chart', id }` layer and written to `<slug>/charts/<id>.json`. */
  id: string
  title?: string
  chartType: 'bar' | 'line'
  /** X-axis category labels. */
  categories: string[]
  series: Array<{ name: string; data: number[] }>
  xLabel?: string
  yLabel?: string
}

/** An emitted image prompt — a sidecar deliverable, not yet wired into a layer. */
export interface ImagePrompt {
  /** The section heading/id this image is for. */
  section: string
  prompt: string
  aspectRatio: AspectRatio
}

/** A planned section from the outline step — heading + intent, no prose yet. */
export interface SectionStub {
  heading: string
  kind: string
  /** What this section should cover — drives the per-section generation. */
  intent: string
  /** Optional chart id (defined in the outline's `charts`) this section features. */
  chartId?: string
}

/** The fast first step: the story skeleton, before any section prose is written. */
export interface StoryOutline {
  format: StoryFormat
  title: string
  subtitle: string
  byline: string
  accentColors?: { accent?: string; accent2?: string }
  charts: ChartSpec[]
  imagePrompts: ImagePrompt[]
  sections: SectionStub[]
}

/** One generated section, with its visual `body` already normalised for the engine. */
export interface GeneratedSection {
  heading: string
  paragraphs: string[]
  kind: string
  /** Normalised config-entry body (foreground / background / map). */
  body: Record<string, unknown>
}

/** The prose half of a section (the CONTENT pass output): no visual `body` yet. */
export interface SectionContentDraft {
  heading: string
  paragraphs: string[]
  kind: string
}

/**
 * What a section generator is grounded in. Two shapes so the one engine serves
 * both callers:
 * - `outline` — the full compose pipeline (outline stub + research brief +
 *   sources + editor answers). Heading is the planned stub heading (stable
 *   markdown anchor).
 * - `brief` — a lean free-text brief (the canvas PromptBar), where the model
 *   also chooses the heading.
 */
export type SectionContext =
  | {
      source: 'outline'
      outline: StoryOutline
      stub: SectionStub
      sources: SourceDoc[]
      brief: ResearchBrief
      answers: ComposeAnswers
    }
  | { source: 'brief'; format: StoryFormat; brief: string }

/** The full generated story, before serialization to files. */
export interface GeneratedStory {
  slug: string
  format: StoryFormat
  /** YAML frontmatter object (title, subtitle, byline, date, format, theme). */
  frontmatter: Record<string, unknown>
  sections: GeneratedSection[]
  charts: ChartSpec[]
  imagePrompts: ImagePrompt[]
}

/** A source that could not be ingested, with the reason it was skipped. */
export interface IngestFailure {
  origin: string
  reason: string
}

/** The outcome of ingestion: what was read, and what was skipped (and why). */
export interface IngestResult {
  sources: SourceDoc[]
  failures: IngestFailure[]
}

/** A surfaced validation problem from `validateStory`. */
export interface ValidationIssue {
  section?: string
  layer?: string
  message: string
}

/** The serialized, write-ready story files. */
export interface StoryArtifacts {
  slug: string
  /** `<slug>.md` — frontmatter + `## heading` prose. */
  markdown: string
  /** `<slug>.config.yaml` — defaults + sections. */
  configYaml: string
  /** `<slug>/charts/<id>.json` files. */
  charts: Array<{ id: string; json: string }>
  imagePrompts: ImagePrompt[]
}
