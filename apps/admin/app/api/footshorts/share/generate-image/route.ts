import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { generateImage } from '@vismay/ai-gateway'
import {
  findShareImageStyle,
  buildShareImagePrompt,
  type ShareImageModel,
} from '@/lib/footshortsShareStyles'

/**
 * Standalone AI image generation for the footshorts share-card creator.
 *
 * Unlike the story Assets route (`/api/stories/[slug]/assets/generate`), this
 * isn't tied to a story and doesn't persist to a bucket — it returns a base64
 * data URL the client embeds directly in the card DOM, so `html-to-image` can
 * rasterize it on capture without a cross-origin fetch. Routes through
 * `@vismay/ai-gateway` → Vercel AI Gateway, same as the admin Assets feature.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_SUBJECT = 1000

// The card's display ratios don't all map 1:1 to the image model's supported
// set — fold the unsupported ones onto the nearest generated ratio (the image
// fills/crops to the card frame anyway).
type ImageAspect = '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
const ASPECT_MAP: Record<string, ImageAspect> = {
  '1:1': '1:1',
  '4:5': '3:4',
  '9:16': '9:16',
  '3:4': '3:4',
  '5:4': '4:3',
  '4:3': '4:3',
  '16:9': '16:9',
}

const MODELS: Record<ShareImageModel, string> = {
  'image.default': 'image.default',
  'image.seedream': 'image.seedream',
}

interface GenerateBody {
  styleId: string
  subject: string
  ratio?: string
  model?: ShareImageModel
  paletteHexes?: string[]
}

export async function POST(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: GenerateBody
  try {
    body = (await req.json()) as GenerateBody
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }

  const style = findShareImageStyle(body.styleId)
  if (!style) {
    return NextResponse.json({ error: `unknown style "${body.styleId}"` }, { status: 400 })
  }
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  if (!subject) {
    return NextResponse.json({ error: 'missing "subject"' }, { status: 400 })
  }
  if (subject.length > MAX_SUBJECT) {
    return NextResponse.json({ error: `subject exceeds ${MAX_SUBJECT} chars` }, { status: 400 })
  }

  const aspectRatio = ASPECT_MAP[body.ratio ?? '1:1'] ?? '1:1'
  const model = MODELS[body.model ?? 'image.default'] ?? 'image.default'
  const prompt = buildShareImagePrompt({
    style,
    subject,
    paletteHexes: Array.isArray(body.paletteHexes) ? body.paletteHexes.slice(0, 4) : [],
  })

  try {
    const out = await generateImage({
      model,
      prompt,
      aspectRatio,
      metadata: { feature: 'footshorts-share-card', style: style.id },
    })
    const base64 = Buffer.from(out.bytes).toString('base64')
    const dataUrl = `data:${out.mimeType};base64,${base64}`
    return NextResponse.json({
      ok: true,
      dataUrl,
      model: out.modelUsed,
      prompt,
    })
  } catch (e) {
    return NextResponse.json(
      { error: `image generation failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }
}
