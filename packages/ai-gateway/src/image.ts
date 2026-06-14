import {
  experimental_generateImage as aiGenerateImage,
  generateText as aiGenerateText,
  type ModelMessage,
} from 'ai'
import { getGatewayClient } from './client'
import { isLLMImageModel, resolveModel, type ImageModelAlias } from './models'
import type { GenerateImageInput } from './text'

export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4'

export interface GenerateImageOptions {
  /** Alias from MODELS.image or a raw gateway id (e.g. `google/gemini-3-pro-image`). */
  model?: ImageModelAlias | string
  /** Prompt describing the image. */
  prompt: string
  /**
   * Aspect ratio. Honoured precisely on true image models; LLM-path models
   * (Gemini multimodal) don't take an explicit ratio, so we forward it as a
   * prompt hint instead. Default 1:1.
   */
  aspectRatio?: ImageAspectRatio
  /**
   * Optional reference / conditioning images (base64 + mime). Only the
   * multimodal LLM path (Gemini "image" models) consumes these — the model
   * edits/extends from them. Supplying references to a true image model
   * (Imagen / Flux / Seedream) throws, since that path can't take them.
   */
  referenceImages?: GenerateImageInput[]
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
 * straight into Supabase storage / disk / fetch response.
 *
 * Internally branches on the model type:
 *   - True image models (Imagen, Flux, GPT-Image, Seedream) → calls
 *     experimental_generateImage on gateway.imageModel(id).
 *   - Multimodal LLMs (Gemini 3 Pro Image / "nano-banana", Gemini 2.5 Flash
 *     Image) → calls generateText on gateway.languageModel(id) with
 *     responseModalities=['TEXT','IMAGE'] and pulls the image bytes out of
 *     result.files. These are listed by the gateway as `language` models, so
 *     they 404 on the image-model path.
 *
 * Callers see one API; the routing detail stays inside the package.
 */
export async function generateImage(opts: GenerateImageOptions): Promise<ImageResult> {
  const modelId = resolveModel(opts.model ?? 'image.default')
  if (isLLMImageModel(modelId)) {
    return generateImageViaLLM(modelId, opts)
  }
  return generateImageViaImageModel(modelId, opts)
}

async function generateImageViaImageModel(
  modelId: string,
  opts: GenerateImageOptions,
): Promise<ImageResult> {
  if (opts.referenceImages?.length) {
    throw new Error(
      `reference images are only supported on multimodal LLM image models ` +
        `(e.g. image.default / gemini-*-image); "${modelId}" can't take them`,
    )
  }
  const gateway = getGatewayClient()
  const model = gateway.imageModel(modelId)
  const res = await aiGenerateImage({
    model,
    prompt: opts.prompt,
    aspectRatio: opts.aspectRatio ?? '1:1',
    seed: opts.seed,
    headers: opts.metadata,
  })
  const first = res.image
  if (!first) throw new Error('AI gateway returned no image')
  return {
    bytes: first.uint8Array,
    mimeType: first.mediaType ?? 'image/png',
    modelUsed: modelId,
  }
}

async function generateImageViaLLM(
  modelId: string,
  opts: GenerateImageOptions,
): Promise<ImageResult> {
  const gateway = getGatewayClient()
  const model = gateway.languageModel(modelId)

  // Gemini multimodal models don't take an explicit aspectRatio param — fold
  // it into the prompt instead. The model honours these loosely (treat as a
  // hint, not a guarantee).
  const aspect = opts.aspectRatio ?? '1:1'
  const aspectHint = ASPECT_DESCRIPTIONS[aspect] ?? `${aspect} aspect ratio`
  const prompt = `Generate a ${aspectHint} image. ${opts.prompt}`

  // With reference images, send a multimodal user message (text + one image
  // part each) so Gemini conditions the output on them. Without, a bare prompt.
  const refs = opts.referenceImages ?? []
  const input: { prompt: string } | { messages: ModelMessage[] } = refs.length
    ? {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              ...refs.map((img) => ({
                type: 'image' as const,
                image: `data:${img.mimeType};base64,${img.data}`,
              })),
            ],
          },
        ],
      }
    : { prompt }

  const res = await aiGenerateText({
    model,
    ...input,
    headers: opts.metadata,
    providerOptions: {
      // The gateway forwards providerOptions.<provider> to the upstream
      // provider unmodified. For Gemini, the image-output toggle is
      // `responseModalities` — without it the model only returns text.
      google: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    },
  })

  const image = res.files.find((f) => f.mediaType?.startsWith('image/'))
  if (!image) {
    const seen = res.files.map((f) => f.mediaType).join(', ') || '(none)'
    throw new Error(
      `${modelId} returned no image. Files in response: ${seen}. ` +
        `Text: ${res.text.slice(0, 200)}`,
    )
  }
  return {
    bytes: image.uint8Array,
    mimeType: image.mediaType ?? 'image/png',
    modelUsed: modelId,
  }
}

const ASPECT_DESCRIPTIONS: Record<ImageAspectRatio, string> = {
  '1:1': 'square 1:1',
  '16:9': 'wide landscape 16:9',
  '9:16': 'tall portrait 9:16',
  '4:3': 'landscape 4:3',
  '3:4': 'portrait 3:4',
}
