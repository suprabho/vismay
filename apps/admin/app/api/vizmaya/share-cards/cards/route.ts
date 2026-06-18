import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createShareCard, listShareCards } from '@vismay/content-source/vizmayaShareCards'

export const dynamic = 'force-dynamic'

/** List saved share cards, newest first. Optionally scoped to one story. */
export async function GET(request: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const storySlug = request.nextUrl.searchParams.get('storySlug') ?? undefined
  try {
    const cards = await listShareCards({ storySlug })
    return NextResponse.json({ ok: true, cards })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to list cards'
    console.error('[share-cards] list failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** Save the current card snapshot under a name. */
export async function POST(request: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    storySlug?: string | null
    baseType?: string
    ratio?: string | null
    config?: unknown
  }
  const name = body.name?.trim()
  if (!name || !body.baseType || body.config == null) {
    return NextResponse.json({ error: 'name, baseType and config are required' }, { status: 400 })
  }
  // Guard against the opaque-500: a card carrying inline base64 images (AI-gen /
  // uploads embedded in the composition) can balloon the JSON past the
  // serverless body / Postgres limits. Surface that clearly instead of a 500.
  const approxBytes = JSON.stringify(body.config).length
  if (approxBytes > 3_500_000) {
    return NextResponse.json(
      {
        error: `Card is too large to save (~${Math.round(approxBytes / 1e6)}MB). This usually means an uploaded or AI-generated image is embedded inline — re-add it from a Story asset, or use a smaller image.`,
      },
      { status: 413 },
    )
  }
  try {
    const card = await createShareCard({
      name,
      storySlug: body.storySlug ?? null,
      baseType: body.baseType,
      ratio: body.ratio ?? null,
      config: body.config,
    })
    return NextResponse.json({ ok: true, card }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to save card'
    console.error('[share-cards] save failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
