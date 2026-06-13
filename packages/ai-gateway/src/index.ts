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
// Agentic tool helpers — re-exported so call sites define tools without taking a
// direct dependency on the `ai` SDK (keeps that dependency centralised here).
export { tool, type ToolSet } from 'ai'
export { generateImage, type GenerateImageOptions, type ImageResult } from './image'
export { definePrompt, type Prompt } from './prompt'
export {
  hashRequest,
  lookupCachedGeneration,
  recordGeneration,
  recordFeedback,
  type GenerationKind,
  type GenerationRecord,
  type FeedbackRating,
} from './cache'
