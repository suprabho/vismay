/**
 * Vismay's thin wrapper around the Vercel AI Gateway.
 *
 * One client, one model registry, one prompt-template type. Every call site
 * (admin UI, ingest scripts, render workflows, CF workers via HTTPS) routes
 * through here so logs, fallbacks, and spend live in one place.
 *
 * See README.md for the full surface; the most common imports are:
 *
 *   import { generateText, generateImage, MODELS } from '@vismay/ai-gateway'
 */

export { getGatewayClient } from './client'
export { MODELS, resolveModel, type ModelAlias, type ImageModelAlias } from './models'
export {
  generateText,
  type GenerateTextOptions,
  type GenerateImageInput,
} from './text'
export { generateImage, type GenerateImageOptions, type ImageResult } from './image'
export { definePrompt, type Prompt } from './prompt'
export {
  hashRequest,
  lookupCachedGeneration,
  recordGeneration,
  type GenerationKind,
  type GenerationRecord,
} from './cache'
