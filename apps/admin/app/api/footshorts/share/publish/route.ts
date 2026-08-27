import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { finalizeShareCardPublish, type ShareCardEntityInput } from '@vismay/content-source/footshortsShareCards'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

/** Ship a share card into the footshorts product. Phase 2 of the flow: the
 *  rendered PNG has already been uploaded to Storage via the signed URL from
 *  `/api/footshorts/share/publish-url`, so this only flips the card to published,
 *  stamps its image URL + ratio, and tags it with entities. The PNG never passes
 *  through here — a base64 data URL in the body would blow past Vercel's ~4.5 MB
 *  request cap (413). */
export async function POST(request: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as {
    id?: string
    ratio?: string
    entities?: ShareCardEntityInput[]
  }
  if (!body.id || !UUID_RE.test(body.id)) {
    return NextResponse.json({ error: 'a valid card id is required' }, { status: 400 })
  }
  if (!body.ratio) {
    return NextResponse.json({ error: 'ratio is required' }, { status: 400 })
  }
  const entities = (body.entities ?? [])
    .filter(
      (e): e is ShareCardEntityInput =>
        !!e && (e.type === 'team' || e.type === 'league') && !!e.slug,
    )
    .map((e) => ({ type: e.type, slug: e.slug }))

  try {
    const card = await finalizeShareCardPublish({ id: body.id, ratio: body.ratio, entities })
    return NextResponse.json({ ok: true, card }, { status: 201 })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'publish failed' },
      { status: 500 },
    )
  }
}
