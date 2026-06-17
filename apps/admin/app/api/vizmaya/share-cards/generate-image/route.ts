import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { generateImage } from '@vismay/ai-gateway'

/**
 * Standalone AI image generation for the Vizmaya share-card composer.
 *
 * Mirrors the footshorts share generate-image route: not tied to a story and
 * not persisted to a bucket — it returns a base64 data URL the client embeds
 * directly in the card DOM, so `html-to-image` can rasterize it on capture
 * without a cross-origin fetch. Routes through `@vismay/ai-gateway`.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_SUBJECT = 2000

// The card's display ratios fold onto the image model's supported set; the
// image fills/crops to the card frame anyway.
type ImageAspect = '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
const ASPECT_MAP: Record<string, ImageAspect> = {
  '1:1': '1:1',
  '4:5': '3:4',
  '3:4': '3:4',
  '4:3': '4:3',
  '16:9': '16:9',
  '9:16': '9:16',
}

type ShareImageModel = 'image.default' | 'image.seedream'

interface GenerateBody {
  subject: string
  /** Optional style preface prepended to the prompt. */
  stylePrefix?: string
  ratio?: string
  model?: ShareImageModel
  paletteHexes?: string[]
  /** Optional reference image as a `data:image/...;base64,...` URL. */
  referenceImage?: string
}

function parseDataUrl(s: string): { data: string; mimeType: string } | null {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(s.trim())
  if (!m) return null
  return { mimeType: m[1], data: m[2] }
}

function buildPrompt(subject: string, stylePrefix: string | undefined, paletteHexes: string[]): string {
  const parts = [
    stylePrefix?.trim(),
    subject,
    paletteHexes.length > 0 ? `Use a color palette built around ${paletteHexes.join(', ')}.` : '',
    'No text, no watermark, no logos.',
  ].filter(Boolean)
  return parts.join('. ').replace(/\.\.+/g, '.')
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

  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  if (!subject) {
    return NextResponse.json({ error: 'missing "subject"' }, { status: 400 })
  }
  if (subject.length > MAX_SUBJECT) {
    return NextResponse.json({ error: `subject exceeds ${MAX_SUBJECT} chars` }, { status: 400 })
  }

  const aspectRatio = ASPECT_MAP[body.ratio ?? '1:1'] ?? '1:1'
  const prompt = buildPrompt(
    subject,
    body.stylePrefix,
    Array.isArray(body.paletteHexes) ? body.paletteHexes.slice(0, 4) : [],
  )

  // A reference image only works on the multimodal LLM path, so force the
  // default (Gemini image) model when one is attached regardless of the picker.
  let referenceImages: Array<{ data: string; mimeType: string }> | undefined
  if (body.referenceImage) {
    const ref = parseDataUrl(body.referenceImage)
    if (!ref) {
      return NextResponse.json(
        { error: 'invalid "referenceImage" — expected a base64 image data URL' },
        { status: 400 },
      )
    }
    referenceImages = [ref]
  }
  const model: ShareImageModel = referenceImages ? 'image.default' : body.model ?? 'image.default'

  try {
    const out = await generateImage({
      model,
      prompt,
      aspectRatio,
      referenceImages,
      metadata: { feature: 'vizmaya-share-card' },
    })
    const base64 = Buffer.from(out.bytes).toString('base64')
    const dataUrl = `data:${out.mimeType};base64,${base64}`
    return NextResponse.json({ ok: true, dataUrl, model: out.modelUsed, prompt })
  } catch (e) {
    return NextResponse.json(
      { error: `image generation failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }
}
