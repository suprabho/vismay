import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { parse as parseYaml } from 'yaml'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'
import { buildAssetRef, resolveAssetUrl } from '@vismay/viz-engine'
import {
  generateText,
  generateImage,
  hashRequest,
  recordGeneration,
  resolveModel,
} from '@vismay/ai-gateway'
import { aiSlotConfig, type AiSlotKind } from '@/components/canvas/aiSlots'
import { buildSlotSchemaPrompt } from '@/components/canvas/overrideSchemas'
import { getFeatureModel } from '@/lib/aiModelSettings'
import { buildSlotContext } from '@/lib/slotContext'
import { resolveStoryPack } from '@/lib/storyPack'

/**
 * Generate the value for one editable canvas slot from a prompt.
 *
 * Sibling of `assets/generate/route.ts`, generalised across every slot the
 * canvas exposes (see `aiSlots.ts`). Two modalities:
 *
 *   - **text**  → `generateText` in the slot's `language` (markdown / yaml /
 *     plaintext). The server returns the candidate *string* only; the client
 *     applies it through the existing `mergeSlice` → `saveSlice` path, so undo
 *     and validation match a manual edit. For YAML slots we strip stray code
 *     fences and flag (don't reject) output that fails to parse.
 *   - **image** → `generateImage`, uploaded to the `story-assets` bucket the
 *     same as manual uploads; returns the new asset ref so the client can wire
 *     it into the layer.
 *
 * Every call writes an `ai_generations` audit row (kind `'text'` | `'image'`).
 * The endpoint never persists to config.yaml / override files itself.
 */

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/
const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/
const BUCKET = 'story-assets'
const MAX_PROMPT_LENGTH = 4000
const MAX_SYSTEM_LENGTH = 8000

const ALLOWED_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const
type AspectRatio = (typeof ALLOWED_ASPECTS)[number]

interface GenerateBody {
  kind: AiSlotKind
  /** Only meaningful for `kind: 'layer'` — routes image layers to image gen. */
  layerType?: string
  prompt: string
  /** Overrides the slot's default system prompt when the author edits it. */
  system?: string
  /** Model alias; must belong to the slot's allowed set. */
  model?: string
  /** Image modality only. */
  aspectRatio?: AspectRatio
  /** Optional current slice text, supplied as context for an iterative edit. */
  current?: string
  /** The section being edited (indexes config.sections) — lets the route load
   *  the live story/section/data context for the generation. Optional: surfaces
   *  with no unit in scope degrade to the story-frame-only context. */
  parentIndex?: number
  subIndex?: number
  /** The chart being edited, when the slot is a specific chart's data. */
  chartId?: string
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) {
    return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  }

  let body: GenerateBody
  try {
    body = (await req.json()) as GenerateBody
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }

  const config = aiSlotConfig(body.kind, body.layerType)
  if (!config) {
    return NextResponse.json(
      { error: `unknown slot kind "${body.kind}"` },
      { status: 400 },
    )
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) {
    return NextResponse.json({ error: 'missing "prompt"' }, { status: 400 })
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json(
      { error: `prompt exceeds ${MAX_PROMPT_LENGTH} chars` },
      { status: 400 },
    )
  }

  // System prompt, in priority order:
  //   1. caller override (the author edited the textarea),
  //   2. the schema-aware prompt for this slot (exact YAML shape),
  //   3. the slot's generic default (backstop for slots we can't yet derive).
  // buildSlotSchemaPrompt owns the modality guard, so image layers keep their
  // artistic default rather than getting a YAML schema. The story's vertical
  // pack (best-effort) extends the layer vocabulary for vertical stories.
  const pack = await resolveStoryPack(slug).catch(() => null)
  const schemaPrompt = buildSlotSchemaPrompt(
    body.kind,
    body.layerType,
    pack?.extraLayerTypes ?? [],
  )
  const system =
    typeof body.system === 'string' && body.system.trim()
      ? body.system.trim().slice(0, MAX_SYSTEM_LENGTH)
      : (schemaPrompt ?? config.defaultSystem)

  // Model: caller choice if it's in the allowed set, else the mapped feature
  // default (if it fits the slot), else the slot's first model.
  const requested = typeof body.model === 'string' ? body.model : null
  const featureDefault = await getFeatureModel(
    config.modality === 'image' ? 'generateImage' : 'generate',
  )
  const modelAlias =
    requested && config.models.includes(requested)
      ? requested
      : config.models.includes(featureDefault)
        ? featureDefault
        : config.models[0]
  let modelId: string
  try {
    modelId = resolveModel(modelAlias)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'invalid model' },
      { status: 400 },
    )
  }

  let supabase
  try {
    supabase = createServiceClient()
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'supabase init failed' },
      { status: 500 },
    )
  }

  if (config.modality === 'image') {
    return handleImage({
      supabase,
      slug,
      kind: body.kind,
      modelAlias,
      modelId,
      // Image models take no system message — fold the slot guidance into the prompt.
      prompt: `${system}\n\n${prompt}`,
      rawPrompt: prompt,
      aspectRatio: ALLOWED_ASPECTS.includes(body.aspectRatio as AspectRatio)
        ? (body.aspectRatio as AspectRatio)
        : '1:1',
    })
  }

  // ─── Text modality ──────────────────────────────────────────────
  // Give the model the current value as context when iterating on an edit.
  const base =
    typeof body.current === 'string' && body.current.trim()
      ? `${prompt}\n\nCurrent value (revise this):\n${body.current.trim()}`
      : prompt

  // Live story/section/data context, prepended so schema-valid output is also
  // contextually correct (real chart ids, palette, established facts). Best
  // effort — a context failure must never block the generation.
  const context = await buildSlotContext({
    slug,
    parentIndex: intOrUndefined(body.parentIndex),
    subIndex: intOrUndefined(body.subIndex),
    kind: body.kind,
    layerType: body.layerType,
    chartId: typeof body.chartId === 'string' ? body.chartId : undefined,
  }).catch(() => null)
  const userPrompt = context ? `${context}\n\n---\n\n${base}` : base

  let raw: string
  try {
    const out = await generateText({
      model: modelAlias,
      system,
      prompt: userPrompt,
      metadata: { feature: 'admin-canvas-generate', slug, kind: body.kind },
    })
    raw = out.result
  } catch (e) {
    return NextResponse.json(
      { error: `text generation failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  const value = stripCodeFence(raw)
  let warning: string | null = null
  if (config.language === 'yaml' && value.trim()) {
    try {
      parseYaml(value)
    } catch (e) {
      warning = `generated text is not valid YAML: ${e instanceof Error ? e.message : 'parse error'}`
    }
  }

  const audit = await safeRecord(supabase, {
    kind: 'text',
    storySlug: slug,
    prompt,
    model: modelId,
    params: { slotKind: body.kind, language: config.language },
    resultRef: null,
    resultText: value,
  })

  return NextResponse.json({
    ok: true,
    value,
    language: config.language,
    generation: { id: audit.id, model: modelId, warning, auditWarning: audit.warning },
  })
}

/* ─── Image modality ─────────────────────────────────────────────── */

async function handleImage(args: {
  supabase: ReturnType<typeof createServiceClient>
  slug: string
  kind: AiSlotKind
  modelAlias: string
  modelId: string
  prompt: string
  rawPrompt: string
  aspectRatio: AspectRatio
}) {
  const { supabase, slug, kind, modelAlias, modelId, prompt, rawPrompt, aspectRatio } = args

  let imageBytes: Uint8Array
  let mimeType: string
  try {
    const out = await generateImage({
      model: modelAlias,
      prompt,
      aspectRatio,
      metadata: { feature: 'admin-canvas-generate', slug, kind },
    })
    imageBytes = out.bytes
    mimeType = out.mimeType
  } catch (e) {
    return NextResponse.json(
      { error: `image generation failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  const filename = `ai-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}.${extensionForMime(mimeType)}`
  if (!SAFE_FILENAME.test(filename)) {
    return NextResponse.json({ error: 'failed to build filename' }, { status: 500 })
  }
  const key = `${slug}/${filename}`
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(key, imageBytes, { contentType: mimeType, upsert: true })
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 })
  }

  const audit = await safeRecord(supabase, {
    kind: 'image',
    storySlug: slug,
    prompt: rawPrompt,
    model: modelId,
    params: { slotKind: kind, aspectRatio, mimeType },
    resultRef: key,
    resultText: null,
  })

  const assetRef = buildAssetRef(slug, filename)
  return NextResponse.json({
    ok: true,
    asset: {
      key,
      filename,
      assetRef,
      url: resolveAssetUrl(assetRef),
      size: imageBytes.byteLength,
      contentType: mimeType,
    },
    generation: { id: audit.id, model: modelId, warning: null, auditWarning: audit.warning },
  })
}

/* ─── Helpers ─────────────────────────────────────────────────────── */

/** Record an audit row without failing the request if the insert errors.
 *  Returns the new row's id (so the client can attach feedback) and a soft
 *  warning string — at most one is non-null. */
async function safeRecord(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    kind: 'text' | 'image'
    storySlug: string
    prompt: string
    model: string
    params: Record<string, unknown>
    resultRef: string | null
    resultText: string | null
  },
): Promise<{ id: string | null; warning: string | null }> {
  const requestHash = hashRequest({
    model: input.model,
    prompt: input.prompt,
    params: input.params,
  })
  try {
    const row = await recordGeneration(supabase, { ...input, requestHash })
    return { id: row.id, warning: null }
  } catch (e) {
    return { id: null, warning: e instanceof Error ? e.message : 'audit log insert failed' }
  }
}

/** Strip a leading/trailing markdown code fence the model sometimes wraps
 *  output in despite instructions (```yaml … ``` / ``` … ```). */
function stripCodeFence(text: string): string {
  const t = text.trim()
  const fence = /^```[a-zA-Z]*\n([\s\S]*?)\n?```$/
  const m = t.match(fence)
  return (m ? m[1] : t).trim()
}

/** Coerce a body field to a non-negative integer, or undefined. */
function intOrUndefined(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined
}

function extensionForMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/avif':
      return 'avif'
    case 'image/gif':
      return 'gif'
    default:
      return 'png'
  }
}
