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
export { ingestSources, extract, extractBuffer } from './ingest'
export type { IngestInput, InputFile, ExtractedSource } from './ingest'
export { research, type ResearchOptions } from './research'
export { generateStory, type GenerateInput, type GenerateOptions } from './generate'
export { validateStory } from './validate'
export { serializeStory } from './serialize'
export { buildChartData, buildEChartsOption } from './chart'
export { DEFAULT_THEME, defaultsFor } from './defaults'
