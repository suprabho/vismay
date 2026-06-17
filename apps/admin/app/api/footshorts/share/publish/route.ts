import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { publishShareCard, type ShareCardEntityInput } from '@vismay/content-source/footshortsShareCards'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

/** Decode a `data:image/png;base64,...` URL to raw bytes. */
function decodePngDataUrl(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/png;base64,(.+)$/i.exec(dataUrl)
  if (!m) return null
  try {
    return new Uint8Array(Buffer.from(m[1]!, 'base64'))
  } catch {
    return null
  }
}

/** Ship a share card into the footshorts product: upload the rendered PNG,
 *  publish the row, and tag it with entities. Pass `id` to update an existing
 *  card in place; omit it to create a new published card. */
export async function POST(request: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as {
    id?: string
    name?: string
    cardType?: string
    config?: unknown
    ratio?: string
    imageDataUrl?: string
    entities?: ShareCardEntityInput[]
  }
  const name = body.name?.trim()
  if (!name || !body.cardType || body.config == null || !body.ratio || !body.imageDataUrl) {
    return NextResponse.json(
      { error: 'name, cardType, config, ratio and imageDataUrl are required' },
      { status: 400 },
    )
  }
  if (body.id && !UUID_RE.test(body.id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }
  const png = decodePngDataUrl(body.imageDataUrl)
  if (!png) {
    return NextResponse.json({ error: 'imageDataUrl must be a PNG data URL' }, { status: 400 })
  }
  const entities = (body.entities ?? [])
    .filter(
      (e): e is ShareCardEntityInput =>
        !!e && (e.type === 'team' || e.type === 'league') && !!e.slug,
    )
    .map((e) => ({ type: e.type, slug: e.slug }))

  try {
    const card = await publishShareCard({
      id: body.id,
      name,
      cardType: body.cardType,
      config: body.config,
      ratio: body.ratio,
      png,
      entities,
    })
    return NextResponse.json({ ok: true, card }, { status: 201 })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'publish failed' },
      { status: 500 },
    )
  }
}
