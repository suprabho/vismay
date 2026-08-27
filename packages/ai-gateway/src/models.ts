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
    fast: 'google/gemini-3-flash',
    /** Reasoning, long context, strict JSON. Use for judge + complex extraction. */
    pro: 'google/gemini-3.1-pro-preview',
    /** Long-form prose, editorial register. Use for narrative content gen. */
    claude: 'anthropic/claude-sonnet-5',
    /** Frontier editorial + long-horizon agentic. Escalate from claude here. */
    opus: 'anthropic/claude-opus-4.8',
    /** Anthropic's tier above opus — deepest reasoning + long-horizon agentic. 1M ctx, $10/$50 per MTok. */
    fable: 'anthropic/claude-fable-5',
    /**
     * Cross-provider reasoning frontier — escalate here if `pro` (Gemini) misses.
     * Deliberately a different lineage than `pro`/`opus` so it's a real second
     * opinion, not the same family one tier up. Sol is deep but slow (~46tps);
     * reach for `terra` when latency matters.
     */
    proPlus: 'openai/gpt-5.6-sol',
    /** Fast OpenAI flagship — 1.1M ctx, $2.5/$15 per MTok, ~100tps. */
    terra: 'openai/gpt-5.6-terra',
    /** xAI general model — lowest latency of the set (~0.9s to first token). 500K ctx, $2/$6. */
    grok: 'xai/grok-4.5',
    /**
     * Coding / structured-edit default. OpenAI Codex — best at producing and
     * editing code, YAML, and JSON config with valid syntax. Use for tasks that
     * emit or rewrite structured files rather than prose.
     */
    code: 'openai/gpt-5.3-codex',
    /** Long-context coder (1M ctx). Reach for when the file/repo context is huge. */
    codeLong: 'alibaba/qwen3-coder-plus',
    /** xAI build/code-focused model. Alternative coder for cross-checking output. */
    codeBuild: 'xai/grok-build-0.1',

    /* ── Budget tier (~10–30× cheaper than `pro`) ── */
    /** Cheap reasoning workhorse, 1M ctx. Strong default for high-volume tasks. */
    deepseek: 'deepseek/deepseek-v4-flash',
    /** Cheapest 1M-ctx general model (vision-capable). Bulk summarise/tag/extract. */
    qwen: 'alibaba/qwen3.5-flash',
    /** Ultra-cheap, 200K ctx, reasoning + tools. Lowest-cost option overall. */
    glm: 'zai/glm-4.7-flash',
    /** OpenAI budget tier — 1.1M ctx, $1/$6 per MTok. Cheap cross-provider option. */
    luna: 'openai/gpt-5.6-luna',
    /** Meta's cheap general model — 1M ctx, $1.25/$4.25 per MTok. */
    muse: 'meta/muse-spark-1.1',
    /** Budget coder for YAML/JSON when `code` is overkill. 262K ctx. */
    codeCheap: 'alibaba/qwen3-coder-30b-a3b',
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
    /** ByteDance Seedream — cheap ($0.03/image) dedicated image model. Budget option. */
    seedream: 'bytedance/seedream-4.0',
    /** Seedream 4.5 — newer Seedream tier ($0.04/image). */
    seedream45: 'bytedance/seedream-4.5',
    /** Seedream 5.0 Lite — latest Seedream line, lite tier ($0.04/image). */
    seedreamLite: 'bytedance/seedream-5.0-lite',
    /* ── The models below IGNORE `aspectRatio` (they take a `size` param generateImage
     *    doesn't send) — output comes back at the provider's default size. Prefer
     *    Imagen/Seedream/default when the layer's aspect ratio matters. ── */
    /** Recraft v4.1 — latest Recraft mainline ($0.04/image). Strong design/brand styles. */
    recraft: 'recraft/recraft-v4.1',
    /** Recraft v4.1 Utility — variant tuned for utility/graphic assets ($0.04/image). */
    recraftUtility: 'recraft/recraft-v4.1-utility',
    /** Recraft v4 — previous Recraft mainline ($0.04/image). */
    recraftV4: 'recraft/recraft-v4',
    /** Recraft v2 — older, cheaper Recraft ($0.02/image). */
    recraftV2: 'recraft/recraft-v2',
    /** Black Forest Labs Flux Pro 1.1 ($0.04/image). */
    fluxPro: 'bfl/flux-pro-1.1',
    /** Prodia-hosted Flux Schnell — cheapest option ($0.001/image). Fast drafts. */
    fluxSchnell: 'prodia/flux-fast-schnell',
    /** xAI Grok Imagine ($0.02/image). */
    grokImage: 'xai/grok-imagine-image',
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

/**
 * Stable fallbacks for volatile gateway ids — chiefly `-preview` releases, which
 * Vercel can rename or retire without notice (a hard "model not found" at call
 * time). When a primary id 404s, `generateText` retries ONCE with its fallback
 * so a vanished preview degrades to a stable model instead of failing the
 * request. Point fallbacks at GA models that won't disappear; once a primary
 * goes GA, swap it in above and drop its entry here.
 */
export const MODEL_FALLBACKS: Readonly<Record<string, string>> = {
  'google/gemini-3.1-pro-preview': 'google/gemini-2.5-pro',
  'google/gemini-3-pro-preview': 'google/gemini-2.5-pro',
}

/** Stable fallback id for a volatile model id, or null if it has none. */
export function fallbackModel(id: string): string | null {
  return MODEL_FALLBACKS[id] ?? null
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
