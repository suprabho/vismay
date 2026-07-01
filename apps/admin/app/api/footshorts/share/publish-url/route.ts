import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { prepareShareCardUpload } from '@vismay/content-source/footshortsShareCards'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

/** Phase 1 of shipping a share card: persist the card (creating it if new) and
 *  return a short-lived signed URL the browser PUTs the rendered PNG straight to
 *  Storage. Keeps the multi-MB PNG out of the request body — Vercel 413s bodies
 *  over ~4.5 MB — mirroring the assets `sign-upload` route. Finalize the publish
 *  via POST `/api/footshorts/share/publish` once the upload lands. */
export async function POST(request: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as {
    id?: string
    name?: string
    cardType?: string
    config?: unknown
  }
  const name = body.name?.trim()
  if (!name || !body.cardType || body.config == null) {
    return NextResponse.json(
      { error: 'name, cardType and config are required' },
      { status: 400 },
    )
  }
  if (body.id && !UUID_RE.test(body.id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  try {
    const prepared = await prepareShareCardUpload({
      id: body.id,
      name,
      cardType: body.cardType,
      config: body.config,
    })
    return NextResponse.json({ ok: true, ...prepared })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'sign failed' },
      { status: 500 },
    )
  }
}
