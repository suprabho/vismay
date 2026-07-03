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
export {
  packForVertical,
  configFormatForVertical,
  VIZMAYA_PACK,
  F1_PACK,
  FOOTSHORTS_PACK,
  type DomainPack,
  type PackLayerType,
} from './packs'
export {
  ingestSources,
  extract,
  extractBuffer,
  extractText,
  extractPdfVision,
  extractPdfLite,
  assessLiteExtraction,
  extractWithMarkitdown,
  isMarkitdownExt,
  isMarkitdownAvailable,
  MARKITDOWN_EXTS,
} from './ingest'
export type {
  IngestInput,
  InputFile,
  InputText,
  ExtractedSource,
  VisionPdfOptions,
  LiteExtractionResult,
  LiteExtractionAssessment,
  MarkitdownOptions,
} from './ingest'
export {
  graftRecapForeground,
  graftSectionBody,
  collectRecapDirectives,
  collectVerticalDirectives,
  type GraftRecapResult,
} from './ingest/recapForeground'
export { research, type ResearchOptions } from './research'
export { generateAngles } from './angles'
export {
  generateStory,
  generateOutline,
  generateOutlineSection,
  generateChart,
  generateChartRequirement,
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
export {
  COVER_ANCHOR,
  COVER_PANEL,
  isDeckCover,
  completeCoverBody,
  composeImageFilename,
  findCoverImagePrompt,
  coverImageLayer,
} from './cover'
export { completeMapHero, completeMapHeroProse } from './mapHero'
export { buildChartData, buildEChartsOption } from './chart'
export { buildRegionLayer } from './regions'
export { DEFAULT_THEME, defaultsFor } from './defaults'
export {
  TEXT_MODEL_CHOICES,
  DEFAULT_TEXT_MODEL,
  isAllowedTextModel,
  type ModelChoice,
} from './models'
