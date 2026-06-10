/**
 * @vismay/story-pipeline — sources → research → ask → render.
 *
 *   import { ingestSources, research, generateStory, validateStory, serializeStory }
 *     from '@vismay/story-pipeline'
 *
 * The pipeline is node-safe (runs under tsx and in a Next route). It reuses
 * viz-engine's own layer schemas for generation + validation, so a generated
 * story is valid by construction. See README.md.
 */

export * from './types'
export { ingestSources, extract, extractBuffer, extractText, extractPdfVision } from './ingest'
export type { IngestInput, InputFile, InputText, ExtractedSource, VisionPdfOptions } from './ingest'
export { research, type ResearchOptions } from './research'
export { generateAngles } from './angles'
export {
  generateStory,
  generateOutline,
  generateChart,
  generateRegions,
  injectRegions,
  generateSection,
  generateSectionContent,
  generateSectionVisual,
  generateSubsectionContent,
  generateSubsectionVisual,
  generateSubsections,
  assembleStory,
  slugify,
  type GenerateInput,
  type GenerateOptions,
  type SectionGenOptions,
} from './generate'
export { validateStory } from './validate'
export {
  lintOutline,
  lintStory,
  lintSectionBody,
  formatLintIssue,
  type LayoutLintIssue,
  type LintSeverity,
} from './lintLayout'
export { serializeStory } from './serialize'
export { buildChartData, buildEChartsOption } from './chart'
export { buildRegionLayer } from './regions'
export { DEFAULT_THEME, defaultsFor } from './defaults'
export {
  TEXT_MODEL_CHOICES,
  DEFAULT_TEXT_MODEL,
  isAllowedTextModel,
  type ModelChoice,
} from './models'
