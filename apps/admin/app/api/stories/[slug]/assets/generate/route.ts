import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'
import { buildAssetRef, resolveAssetUrl } from '@vismay/viz-engine'
import {
  generateImage,
  hashRequest,
  recordGeneration,
  resolveModel,
  type ImageModelAlias,
} from '@vismay/ai-gateway'
import type { AssetListEntry } from '../route'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/
const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/
const BUCKET = 'story-assets'
const MAX_PROMPT_LENGTH = 4000

const ALLOWED_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const
type AspectRatio = (typeof ALLOWED_ASPECTS)[number]

interface GenerateBody {
  prompt: string
  aspectRatio?: AspectRatio
  model?: ImageModelAlias | string
  /** Optional override; otherwise we generate `ai-<timestamp>-<rand>.<ext>`. */
  filename?: string
}

/**
 * Generate an image via the AI gateway and store it as a regular story asset.
 *
 * The endpoint deliberately mirrors the POST shape of the sibling assets
 * route: it returns the same AssetListEntry so the AssetsPanel can append the
 * result without a refetch. The generation is logged to `ai_generations` so
 * the prompt is recoverable (powers a future "Regenerate" affordance).
 */
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

  const aspectRatio: AspectRatio = ALLOWED_ASPECTS.includes(body.aspectRatio as AspectRatio)
    ? (body.aspectRatio as AspectRatio)
    : '1:1'

  const modelAlias = body.model ?? 'image.default'
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

  // Call the gateway first — no point reserving a filename if generation 500s.
  let imageBytes: Uint8Array
  let mimeType: string
  try {
    const out = await generateImage({
      model: modelAlias,
      prompt,
      aspectRatio,
      metadata: { feature: 'admin-assets-generate', slug },
    })
    imageBytes = out.bytes
    mimeType = out.mimeType
  } catch (e) {
    return NextResponse.json(
      { error: `image generation failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  const ext = extensionForMime(mimeType)
  const filename = pickFilename(body.filename, ext)
  if (!filename || !SAFE_FILENAME.test(filename)) {
    return NextResponse.json(
      { error: `bad filename "${body.filename}" — must match [a-zA-Z0-9._-]` },
      { status: 400 },
    )
  }

  const key = `${slug}/${filename}`
  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(key, imageBytes, {
    contentType: mimeType,
    upsert: true,
  })
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 })
  }

  // Record after a successful upload so the audit log never points at a
  // missing object. A failed insert here doesn't roll back the upload — we
  // surface it as a soft warning so the asset still appears in the list.
  const params_ = { aspectRatio, mimeType }
  const requestHash = hashRequest({ model: modelId, prompt, params: params_ })
  let auditWarning: string | null = null
  try {
    await recordGeneration(supabase, {
      kind: 'image',
      storySlug: slug,
      prompt,
      model: modelId,
      params: params_,
      requestHash,
      resultRef: key,
      resultText: null,
    })
  } catch (e) {
    auditWarning = e instanceof Error ? e.message : 'audit log insert failed'
  }

  const assetRef = buildAssetRef(slug, filename)
  const entry: AssetListEntry = {
    key,
    filename,
    assetRef,
    url: resolveAssetUrl(assetRef),
    size: imageBytes.byteLength,
    contentType: mimeType,
    updatedAt: new Date().toISOString(),
  }
  return NextResponse.json({
    ok: true,
    asset: entry,
    generation: {
      model: modelId,
      requestHash,
      auditWarning,
    },
  })
}

function pickFilename(override: string | undefined, ext: string): string {
  if (override && override.trim()) {
    const name = override.trim()
    // Caller's override wins, but only if it has an extension — otherwise the
    // browser won't pick a sensible Content-Type from the URL.
    return name.includes('.') ? name : `${name}.${ext}`
  }
  const ts = Date.now().toString(36)
  const rand = randomBytes(3).toString('hex')
  return `ai-${ts}-${rand}.${ext}`
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
      // Unknown — fall back to png so the file is still recognisable as an
      // image. If providers start returning something exotic we add it here.
      return 'png'
  }
}
