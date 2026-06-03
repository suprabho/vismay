# @vismay/ai-gateway

Thin wrapper around the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway).
One client, one model registry, one prompt-template type — so every text/image
generation call site (admin UI, ingest scripts, render workflows, CF workers)
goes through one seam.

## Why a gateway

Today the repo has direct `@google/genai` + `@anthropic-ai/sdk` calls in a
dozen places: [judge.ts](../../packages/eval-entities/src/judge.ts), the energy
profile + epstein scripts, the audio render workflow, the CF workers. Each one
reads `GEMINI_API_KEY` directly, has its own retry shape, no shared logging.

Routing through the gateway gives us:

- Provider-agnostic call sites (swap Gemini Flash → Claude Sonnet in one line).
- One billing surface + per-feature spend (via the `metadata` headers).
- Built-in fallbacks, caching, rate-limit retries — no DIY.
- Same code path works from Vercel apps, Node scripts, and CF workers.

## Env

Local dev: drop `AI_GATEWAY_API_KEY` in `.env.local`. Get the key from
the Vercel dashboard → AI → API Keys.

Vercel production: omit the var. The runtime injects an OIDC token the SDK
picks up automatically — no key rotation, no secret management.

CF workers: set `AI_GATEWAY_API_KEY` as a worker secret.

## Usage

### Text

```ts
import { generateText } from '@vismay/ai-gateway'

const { result, usage } = await generateText({
  model: 'text.fast',
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
  model: 'text.pro',
  prompt: '…',
  schema: Schema,
})
// result is typed as { summary: string; tags: string[] }
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
| `text.fast` | `google/gemini-3-flash` |
| `text.pro` | `google/gemini-3.1-pro-preview` |
| `text.proPlus` | `openai/gpt-5.5` (cross-provider frontier) |
| `text.claude` | `anthropic/claude-sonnet-4.6` |
| `text.opus` | `anthropic/claude-opus-4.8` (frontier editorial/agentic) |
| `text.code` | `openai/gpt-5.3-codex` (code/YAML/JSON default) |
| `text.codeLong` | `alibaba/qwen3-coder-plus` (1M ctx coder) |
| `text.codeBuild` | `xai/grok-build-0.1` (code-focused) |
| `image.default` | `google/gemini-3-pro-image` (multimodal LLM) |
| `image.geminiFlashImage` | `google/gemini-2.5-flash-image` (multimodal LLM) |
| `image.imagen` | `google/imagen-4.0-generate-001` |
| `image.imagenFast` | `google/imagen-4.0-fast-generate-001` |
| `image.imagenUltra` | `google/imagen-4.0-ultra-generate-001` |

`generateImage` auto-detects whether a model id is a dedicated image model or
a multimodal LLM (Gemini nano-banana, Gemini Flash Image) and picks the
correct call path under the hood. For LLM-path models the aspect ratio is
forwarded as a prompt hint rather than a hard parameter — treat it as
guidance, not a guarantee.

Adding a model = adding a row here. Call sites use aliases, so swaps don't
touch product code.
