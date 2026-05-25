/**
 * Model registry.
 *
 * Call sites pass aliases ("text.fast", "image.default"), not provider IDs,
 * so model upgrades (Gemini 3 → Gemini 4, swap Claude → OpenAI for one task)
 * land in this file alone. Aliases also let us split text vs. image namespaces
 * without conflating which models can do what.
 *
 * Gateway IDs are always `<provider>/<model>` strings, exactly as Vercel AI
 * Gateway exposes them.
 */

export const MODELS = {
  text: {
    /** Cheap, fast, decent quality. Workhorse for summaries, taggers, NER. */
    fast: 'google/gemini-2.5-flash',
    /** Reasoning, long context, strict JSON. Use for judge + complex extraction. */
    pro: 'google/gemini-2.5-pro',
    /** Long-form prose, editorial register. Use for narrative content gen. */
    claude: 'anthropic/claude-sonnet-4.6',
    /** Latest reasoning frontier — escalate here if pro misses. */
    proPlus: 'google/gemini-3-pro',
  },
  image: {
    /**
     * Gemini 3 Pro Image (nano-banana). Multimodal LLM — emits images inside
     * its response. Gateway lists this as a `language` model, so generateImage
     * routes it through the languageModel + responseModalities path (see
     * LLM_IMAGE_MODELS below).
     */
    default: 'google/gemini-3-pro-image',
    /** Older multimodal Gemini image variant. Same LLM-path call shape. */
    geminiFlashImage: 'google/gemini-2.5-flash-image',
    /** Imagen 4 — Google's dedicated image model. True `image` type on the gateway. */
    imagen: 'google/imagen-4.0-generate-001',
    /** Cheaper, faster Imagen 4 — good for iteration loops. */
    imagenFast: 'google/imagen-4.0-fast-generate-001',
    /** Highest-quality Imagen 4 — slower and pricier. */
    imagenUltra: 'google/imagen-4.0-ultra-generate-001',
  },
} as const

/**
 * Models the gateway lists as `language` but that emit images via the
 * responseModalities=IMAGE channel. generateImage detects these and routes
 * them through generateText + a parse-from-files step rather than the
 * experimental_generateImage path (which would 404 with "No such imageModel").
 *
 * Keep this in sync with the gateway's /v1/models endpoint — any new Gemini
 * image LLM Google ships should be added here.
 */
export const LLM_IMAGE_MODELS: ReadonlySet<string> = new Set([
  'google/gemini-3-pro-image',
  'google/gemini-2.5-flash-image',
  'google/gemini-3.1-flash-image-preview',
])

/** True if the image model id needs the LLM path instead of experimental_generateImage. */
export function isLLMImageModel(id: string): boolean {
  return LLM_IMAGE_MODELS.has(id)
}

export type TextModelAlias = `text.${keyof typeof MODELS.text}`
export type ImageModelAlias = `image.${keyof typeof MODELS.image}`
export type ModelAlias = TextModelAlias | ImageModelAlias

/**
 * Resolve an alias ("text.pro") to its gateway model ID ("google/gemini-2.5-pro").
 * Passes through any string that already looks like a gateway ID (contains a /
 * and no leading "text." / "image.") so call sites can drop down to a specific
 * model without registering it.
 */
export function resolveModel(alias: ModelAlias | string): string {
  if (alias.startsWith('text.')) {
    const key = alias.slice(5) as keyof typeof MODELS.text
    const id = MODELS.text[key]
    if (!id) throw new Error(`Unknown text model alias: ${alias}`)
    return id
  }
  if (alias.startsWith('image.')) {
    const key = alias.slice(6) as keyof typeof MODELS.image
    const id = MODELS.image[key]
    if (!id) throw new Error(`Unknown image model alias: ${alias}`)
    return id
  }
  if (alias.includes('/')) return alias
  throw new Error(
    `Bad model id "${alias}" — expected alias (text.* / image.*) or gateway id (provider/model)`,
  )
}
