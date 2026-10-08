# @vismay/ai-gateway

Thin wrapper around the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway).
One client, one model registry, one prompt-template type — so every text/image
generation call site (admin UI, ingest scripts, render workflows, CF workers)
goes through one seam.

## Why a gateway

Every model call in the repo — the footshorts / vizf1 ingest workers, the
entity judge, the energy-profile + epstein scripts, story narration TTS, the
admin canvas — goes through this package. Nothing reads a provider key
(`GEMINI_API_KEY` is gone); `@anthropic-ai/sdk` survives only in
story-pipeline's opt-in direct path for quota-bound eval runs.

Routing through the gateway gives us:

- Provider-agnostic call sites (swap Haiku → Sonnet in one line).
- One billing surface + per-feature spend (via the `metadata` headers).
- Built-in fallbacks, caching, rate-limit retries — no DIY.
- Same code path works from Vercel apps, Node scripts, and CF workers.

## Env

Local dev: drop `AI_GATEWAY_API_KEY` in `.env.local`. Get the key from
the Vercel dashboard → AI → API Keys.

Vercel production: omit the var. The runtime injects an OIDC token the SDK
picks up automatically — no key rotation, no secret management.

CF workers: set `AI_GATEWAY_API_KEY` as a worker secret.

## Which call do I want?

| The job | Call | Model |
|---|---|---|
| Decide something about content that exists — yes/no, pick one of N, a score | `decide()` | `decision.jev` |
| High-volume per-item writing/extraction — summaries, tags, NER, OCR of one doc | `generateText()` | `text.haiku` |
| Editorial prose, complex extraction, vision, nested/union schemas (default) | `generateText()` | `text.sonnet` |
| Whole-document restructuring, judges grading other models, long-horizon reasoning | `generateText()` | `text.opus` |
| Images | `generateImage()` | `image.*` (still Google by default) |
| Speech | `generateSpeech()` | `speech.default` (Gemini TTS) |

If one prompt today does both — "is this football? then summarise it" — split
it: the decision to Jev, the writing to Claude. Jev returns calibrated
probabilities you can threshold; a text model's yes/no is just a token.

## Usage

### Text

```ts
import { generateText } from '@vismay/ai-gateway'

const { result, usage } = await generateText({
  model: 'text.haiku',
  system: 'You write short editorial blurbs.',
  prompt: 'Country: India\nMix: coal 70%, solar 20%',
})
```

### Text with typed JSON output

```ts
import { generateText } from '@vismay/ai-gateway'
import { z } from 'zod'

const Schema = z.object({ summary: z.string(), tags: z.array(z.string()) })

const { result } = await generateText({
  model: 'text.sonnet',
  prompt: '…',
  schema: Schema,
})
// result is typed as { summary: string; tags: string[] }
```

### Text with documents (PDF)

```ts
const { result } = await generateText({
  model: 'text.haiku',
  prompt: 'Transcribe this document verbatim.',
  files: [{ data: pdfBuffer.toString('base64'), mimeType: 'application/pdf' }],
})
```

### Decisions (Jev)

```ts
import { decide } from '@vismay/ai-gateway'

const { answers } = await decide({
  state: { headline, article },
  questions: {
    topic: {
      type: 'choice',
      instructions: 'What is this article primarily about?',
      criteria: { on_pitch: 'Matches, goals, tactics…', transfer: 'Signings, contracts…', unrelated: 'Anything else.' },
    },
    subject: {
      type: 'boolean',
      instructions: 'Is "Arsenal" a subject of this article rather than a passing mention?',
      criteria: { true: 'Primary or substantive secondary subject.', false: 'Mentioned in passing.' },
    },
  },
})
answers.topic.choice        // 'on_pitch' | 'transfer' | 'unrelated'
answers.subject.probability // P(true), 0..1
```

All questions share one `state` and are answered in a single round trip —
keep a call to a couple of dozen. `decide()` throws on failure or refusal;
precision gates catch that and fail open. `JEV_MODEL` overrides the model id.

### Speech

```ts
import { generateSpeech } from '@vismay/ai-gateway'

const { bytes, mimeType } = await generateSpeech({ text, voice: 'Orus', outputFormat: 'wav' })
```

### Image

```ts
import { generateImage } from '@vismay/ai-gateway'

const { bytes, mimeType } = await generateImage({
  prompt: 'isometric illustration of OPEC oil tankers in the Strait of Hormuz',
  aspectRatio: '16:9',
})
// pipe bytes into Supabase storage / fetch response / disk
```

### With dedupe + audit

```ts
import {
  generateImage,
  hashRequest,
  lookupCachedGeneration,
  recordGeneration,
} from '@vismay/ai-gateway'
import { createServiceClient } from '@vismay/content-source/supabase'
import { MODELS } from '@vismay/ai-gateway'

const sb = createServiceClient()
const model = MODELS.image.default
const params = { aspectRatio: '16:9' as const }
const requestHash = hashRequest({ model, prompt, params })

const cached = await lookupCachedGeneration(sb, requestHash)
if (cached) return cached.resultRef

const { bytes, mimeType } = await generateImage({ prompt, ...params })
// …upload bytes to storage, get assetPath…
await recordGeneration(sb, {
  kind: 'image',
  storySlug: slug,
  prompt,
  model,
  params,
  requestHash,
  resultRef: assetPath,
  resultText: null,
})
```

## Models

Aliases live in [src/models.ts](src/models.ts). Today:

| Alias | Gateway ID |
|---|---|
| `text.haiku` | `anthropic/claude-haiku-5.5` (light tier) |
| `text.sonnet` | `anthropic/claude-sonnet-5.5` (standard tier, default) |
| `text.opus` | `anthropic/claude-opus-5.5` (heavy tier) |
| `text.fast` / `text.pro` / `text.claude` | legacy → Haiku 5.5 / Sonnet 5.5 / Sonnet 5.5 |
| `text.fable` | `anthropic/claude-fable-5` |
| `text.proPlus` | `openai/gpt-5.6-sol` (cross-provider frontier) |
| `text.terra` / `text.luna` | `openai/gpt-5.6-terra` / `openai/gpt-5.6-luna` |
| `text.grok` | `xai/grok-4.5` |
| `text.code` | `openai/gpt-5.3-codex` (code/YAML/JSON default) |
| `text.codeLong` | `alibaba/qwen3-coder-plus` (1M ctx coder) |
| `text.codeBuild` | `xai/grok-build-0.1` (code-focused) |
| `text.deepseek` | `deepseek/deepseek-v4-flash` (cheap reasoning, 1M ctx) |
| `text.qwen` | `alibaba/qwen3.5-flash` (cheapest 1M-ctx general) |
| `text.glm` | `zai/glm-4.7-flash` (ultra-cheap, 200K ctx) |
| `text.codeCheap` | `alibaba/qwen3-coder-30b-a3b` (budget YAML/JSON coder) |
| `image.default` | `google/gemini-3-pro-image` (multimodal LLM) |
| `image.geminiFlashImage` | `google/gemini-2.5-flash-image` (multimodal LLM) |
| `image.imagen` | `google/imagen-4.0-generate-001` |
| `image.imagenFast` | `google/imagen-4.0-fast-generate-001` |
| `image.imagenUltra` | `google/imagen-4.0-ultra-generate-001` |
| `image.seedream` / `image.seedream45` / `image.seedreamLite` | `bytedance/seedream-*` (cheap) |
| `image.muse` | `meta/muse-image-1.0` |
| `image.recraft*` | `recraft/recraft-v*` (design/brand styles) |
| `image.fluxPro` / `image.fluxSchnell` | `bfl/flux-pro-1.1` / `prodia/flux-fast-schnell` |
| `image.grokImage` | `xai/grok-imagine-image` |
| `image.gptImage` | `openai/gpt-image-2.5-sunburst` |
| `image.gptImageFlare` | `openai/gpt-image-2.5-flare` |
| `decision.jev` | `typesafe-ai/jev` (typed decisions via `decide()`) |
| `speech.default` / `speech.lite` | `google/gemini-3.8-flash-tts` / `google/gemini-3.8-flash-lite-tts` |

`generateImage` auto-detects whether a model id is a dedicated image model or
a multimodal LLM (Gemini nano-banana, Gemini Flash Image) and picks the
correct call path under the hood. For LLM-path models the aspect ratio is
forwarded as a prompt hint rather than a hard parameter — treat it as
guidance, not a guarantee. The Recraft and GPT-Image families take a `size`
param rather than `aspectRatio`, so they ignore it entirely and return the
provider's default size — reach for Imagen/Seedream/`image.default` when a
layer's aspect ratio matters.

Adding a model = adding a row here. Call sites use aliases, so swaps don't
touch product code.
