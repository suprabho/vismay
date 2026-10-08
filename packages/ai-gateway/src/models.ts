/**
 * Model registry.
 *
 * Call sites pass aliases ("text.haiku", "image.default"), not provider IDs,
 * so model upgrades (Sonnet 5.5 → 6, swap Claude → OpenAI for one task) land
 * in this file alone. Aliases also let us split text / image / decision /
 * speech namespaces without conflating which models can do what.
 *
 * Text work is tiered by complexity on Claude:
 *   - text.haiku  — high-volume, per-item work: summaries, taggers, NER,
 *                   field extraction, OCR of a single page.
 *   - text.sonnet — editorial prose, multi-step extraction, vision, strict
 *                   JSON with nested/union schemas. The default.
 *   - text.opus   — the hardest calls: whole-document restructuring, judges
 *                   grading other models, long-horizon reasoning.
 *
 * Typed decisions (yes/no, pick-one-of-N, score) don't go to a text model at
 * all — they go to Jev via `decide()` (see ./decide.ts), which returns a
 * calibrated probability instead of prose.
 *
 * Gateway IDs are always `<provider>/<model>` strings, exactly as Vercel AI
 * Gateway exposes them.
 */

export const MODELS = {
  text: {
    /** Light tier — cheap + fast. Workhorse for summaries, taggers, NER, per-item extraction. */
    haiku: 'anthropic/claude-haiku-5.5',
    /** Standard tier — editorial prose, complex extraction, vision, union schemas. */
    sonnet: 'anthropic/claude-sonnet-5.5',
    /** Heavy tier — whole-document restructuring, judges, long-horizon reasoning. */
    opus: 'anthropic/claude-opus-5.5',
    /**
     * Legacy aliases, kept so persisted admin settings, env overrides
     * (EVAL_MODEL=text.pro …) and older call sites keep resolving. They used to
     * point at Gemini; they now map onto the Claude tier of the same weight.
     * Prefer the tier names above in new code.
     */
    fast: 'anthropic/claude-haiku-5.5',
    pro: 'anthropic/claude-sonnet-5.5',
    claude: 'anthropic/claude-sonnet-5.5',
    /** Anthropic's tier above opus — deepest reasoning + long-horizon agentic. 1M ctx, $10/$50 per MTok. */
    fable: 'anthropic/claude-fable-5',
    /**
     * Cross-provider reasoning frontier — escalate here if Claude misses.
     * Deliberately a different lineage than the Claude tiers so it's a real
     * second opinion, not the same family one tier up. Sol is deep but slow
     * (~46tps); reach for `terra` when latency matters.
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
    /**
     * Meta Muse Image 1.0 — Meta's dedicated image model, sibling of the
     * `text.muse` (Muse Spark) line. True `image` type on the gateway, so it
     * takes the experimental_generateImage path and honours `aspectRatio`.
     */
    muse: 'meta/muse-image-1.0',
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
    /**
     * OpenAI GPT Image 2.5 (Sunburst). Dedicated image model — strong prompt
     * adherence and legible in-image text. Takes `size`, not `aspectRatio`.
     */
    gptImage: 'openai/gpt-image-2.5-sunburst',
    /** GPT Image 2.5 (Flare) — the sibling variant of the same line. */
    gptImageFlare: 'openai/gpt-image-2.5-flare',
  },
  decision: {
    /**
     * Jev (TypeSafe) — a System One decision model. State plus named typed
     * questions (boolean / choice / score) in, a calibrated probability per
     * question out, no prose. Call through `decide()`.
     */
    jev: 'typesafe-ai/jev',
  },
  speech: {
    /**
     * Gemini TTS. Kept on Google deliberately — Claude has no speech output —
     * but routed through the gateway like everything else, so no call site
     * needs GEMINI_API_KEY. Prebuilt Gemini voices (`Orus`, …) go in `voice`.
     */
    default: 'google/gemini-3.8-flash-tts',
    /** Cheaper Gemini TTS tier. */
    lite: 'google/gemini-3.8-flash-lite-tts',
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
export const MODEL_FALLBACKS: Readonly<Record<string, string>> = {}

/** Stable fallback id for a volatile model id, or null if it has none. */
export function fallbackModel(id: string): string | null {
  return MODEL_FALLBACKS[id] ?? null
}

export type TextModelAlias = `text.${keyof typeof MODELS.text}`
export type ImageModelAlias = `image.${keyof typeof MODELS.image}`
export type DecisionModelAlias = `decision.${keyof typeof MODELS.decision}`
export type SpeechModelAlias = `speech.${keyof typeof MODELS.speech}`
export type ModelAlias = TextModelAlias | ImageModelAlias | DecisionModelAlias | SpeechModelAlias

/**
 * Resolve an alias ("text.sonnet") to its gateway model ID
 * ("anthropic/claude-sonnet-5.5"). Passes through any string that already looks
 * like a gateway ID (contains a / and no known namespace prefix) so call sites
 * can drop down to a specific model without registering it.
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
  if (alias.startsWith('decision.')) {
    const key = alias.slice(9) as keyof typeof MODELS.decision
    const id = MODELS.decision[key]
    if (!id) throw new Error(`Unknown decision model alias: ${alias}`)
    return id
  }
  if (alias.startsWith('speech.')) {
    const key = alias.slice(7) as keyof typeof MODELS.speech
    const id = MODELS.speech[key]
    if (!id) throw new Error(`Unknown speech model alias: ${alias}`)
    return id
  }
  if (alias.includes('/')) return alias
  throw new Error(
    `Bad model id "${alias}" — expected alias (text.* / image.* / decision.* / speech.*) or gateway id (provider/model)`,
  )
}
