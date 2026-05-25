import { experimental_generateImage as aiGenerateImage } from 'ai'
import { getGatewayClient } from './client'
import { resolveModel, type ImageModelAlias } from './models'

export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4'

export interface GenerateImageOptions {
  /** Alias from MODELS.image or a raw gateway id (e.g. `google/imagen-4.0-generate-001`). */
  model?: ImageModelAlias | string
  /** Prompt describing the image. */
  prompt: string
  /** Aspect ratio — providers map to nearest supported size. Defaults to 1:1. */
  aspectRatio?: ImageAspectRatio
  /** Forwarded to the gateway as headers — useful for tagging spend by feature. */
  metadata?: Record<string, string>
  /** Seed for reproducibility, where the provider supports it. */
  seed?: number
}

export interface ImageResult {
  /** Raw image bytes. */
  bytes: Uint8Array
  /** MIME type the provider returned (e.g. `image/png`, `image/jpeg`). */
  mimeType: string
  /** Concrete model the gateway actually served the request from. */
  modelUsed: string
}

/**
 * Generate an image via the AI gateway. Returns raw bytes the caller can pipe
 * straight into Supabase storage / disk / fetch response — we deliberately
 * don't assume PNG so providers that prefer JPEG/WebP aren't lossy-converted.
 */
export async function generateImage(opts: GenerateImageOptions): Promise<ImageResult> {
  const gateway = getGatewayClient()
  const modelId = resolveModel(opts.model ?? 'image.default')
  const model = gateway.imageModel(modelId)

  const res = await aiGenerateImage({
    model,
    prompt: opts.prompt,
    aspectRatio: opts.aspectRatio ?? '1:1',
    seed: opts.seed,
    headers: opts.metadata,
  })

  // The AI SDK returns one or more images; we always take the first since our
  // surface generates one image per call. Multi-image flows can use the SDK
  // directly until we see a real need.
  const first = res.image
  if (!first) throw new Error('AI gateway returned no image')

  return {
    bytes: first.uint8Array,
    mimeType: first.mediaType ?? 'image/png',
    modelUsed: modelId,
  }
}
