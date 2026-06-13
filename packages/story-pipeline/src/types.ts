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

/**
 * A chart the outline plans, WITHOUT data — the skeleton declares the chart's
 * shape + a precise `requirement`; the `generateChart` pass produces the
 * numeric series, yielding a full {@link ChartSpec}.
 */
export interface ChartRequirement {
  id: string
  title?: string
  chartType: 'bar' | 'line'
  /** What to plot — figures/series/categories/range, grounded in the sources. */
  requirement: string
  xLabel?: string
  yLabel?: string
}

/**
 * The structured geography a MAP section frames — the outline's camera plan.
 * Free-text `visual` describes the moment; `geo` is the machine-readable spine
 * the downstream passes (and the materialise placeholder) anchor the camera to,
 * so a map story actually travels through its geography.
 */
export interface SectionGeo {
  /** The named place this section frames, e.g. "the Strait of Hormuz", "Sub-Saharan Africa". */
  focus: string
  /** Camera center as [lng, lat] (longitude first — the engine's order). */
  center?: number[]
  /** Camera zoom (≈1–1.5 world, ≈3 continent, ≈4–5.5 country, 6+ sub-region/city). */
  zoom?: number
}

/**
 * A choropleth the outline plans for a map section, WITHOUT values — the mirror
 * of {@link ChartRequirement}. `generateRegions` fills the per-region figures.
 */
export interface RegionRequirement {
  /** What each region is shaded by (the choropleth metric). */
  metric: string
  /** `country` (built-in boundaries, ISO alpha-2) or `custom` (author GeoJSON). */
  level: 'country' | 'custom'
  /** level: custom — author-supplied GeoJSON path. */
  geojsonUrl?: string
  /** level: custom — feature id property matching item codes. */
  idProperty?: string
  /** Which regions to shade and over what range, grounded in the sources. */
  requirement: string
}

/** The grounded output of `generateRegions`: one `{ code, value }` per region. */
export interface RegionData {
  items: Array<{ code: string; value: number; label?: string }>
}

/** An emitted image prompt — a sidecar deliverable, not yet wired into a layer. */
export interface ImagePrompt {
  /** The section heading/id this image is for. */
  section: string
  prompt: string
  aspectRatio: AspectRatio
}

/**
 * A planned sub-beat of a MAP section — the press-freedom pattern: the parent
 * holds the shared map context (camera + choropleth/pin field) and each
 * subsection is its own snap target with its own prose anchor and a camera
 * DIVE within the parent's framing. The parent's prose is never rendered when
 * subsections exist — the children carry all the copy.
 */
export interface SubsectionStub {
  /** Becomes the sub's markdown ## anchor — must be unique across the story. */
  heading: string
  /** One line on this beat's job. */
  intent: string
  /** The specific facts/figures this beat must carry. */
  expectedContent?: string
  /** The camera dive for this beat (overrides the parent's center/zoom). */
  geo?: SectionGeo
  /** What the beat marks — focal pins, what the framing shows. */
  visual?: string
}

/** A planned section from the outline step — the per-section brief, no prose yet. */
export interface SectionStub {
  heading: string
  kind: string
  /** One line on the section's job — drives the per-section generation. */
  intent: string
  /** How this section connects to the ones around it (its narrative role). */
  context?: string
  /** The specific facts/figures/quotes this section must carry. */
  expectedContent?: string
  /** The visualisation the section features (which layers and what each shows). */
  visual?: string
  /** Deck only: the named foreground layout that frames the visual. */
  layout?: string
  /** Optional chart id (defined in the outline's `charts`) this section features. */
  chartId?: string
  /** MAP only: the structured geography (camera focus/center/zoom) the section frames. */
  geo?: SectionGeo
  /** MAP only: if this section shades geography, the choropleth requirement (no values). */
  regionRequirement?: RegionRequirement
  /** MAP only: sub-beats exploring this section's shared map context (2–4). */
  subsections?: SubsectionStub[]
}

/** The fast first step: the story skeleton, before any section prose is written. */
export interface StoryOutline {
  format: StoryFormat
  title: string
  subtitle: string
  byline: string
  accentColors?: { accent?: string; accent2?: string }
  /** Chart requirements (no data) — the data pass turns these into `ChartSpec`s. */
  charts: ChartRequirement[]
  imagePrompts: ImagePrompt[]
  sections: SectionStub[]
}

/** One generated sub-beat: its prose plus the engine's subsection config entry
 *  fields (a partial `map` override — center/zoom from the planned geo, pins
 *  and tilt from the sub visual pass). */
export interface GeneratedSubsection {
  heading: string
  paragraphs: string[]
  /** `SubsectionMapOverride` fields (center/zoom/pitch/bearing/pins). */
  map?: Record<string, unknown>
}

/** One generated section, with its visual `body` already normalised for the engine. */
export interface GeneratedSection {
  heading: string
  paragraphs: string[]
  kind: string
  /** Normalised config-entry body (foreground / background / map). */
  body: Record<string, unknown>
  /** MAP only: generated sub-beats. When present the parent's `paragraphs` are
   *  empty and never rendered — the engine snaps through the children. */
  subsections?: GeneratedSubsection[]
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

/** Serialization format of a story's section config — YAML (legacy / vizmaya)
 *  or JSON (new verticals). Mirrors `@vismay/content-source`'s `ConfigFormat`. */
export type ConfigFormat = 'yaml' | 'json'

/** The serialized, write-ready story files. */
export interface StoryArtifacts {
  slug: string
  /** `<slug>.md` — frontmatter + `## heading` prose. */
  markdown: string
  /** The config document text — `<slug>.config.yaml` (YAML) or, for JSON-native
   *  verticals, `<slug>.config.json` (see `configFormat`). */
  configYaml: string
  /** Which artifact `configYaml` belongs in. */
  configFormat: ConfigFormat
  /** `<slug>/charts/<id>.json` files. */
  charts: Array<{ id: string; json: string }>
  imagePrompts: ImagePrompt[]
}
