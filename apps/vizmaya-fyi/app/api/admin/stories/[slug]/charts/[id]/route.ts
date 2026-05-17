import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource } from '@/lib/contentSource'

const SAFE_ID = /^[a-zA-Z0-9_-]+$/

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug, id } = await params
  if (!SAFE_ID.test(slug) || !SAFE_ID.test(id)) {
    return NextResponse.json({ error: 'bad slug or id' }, { status: 400 })
  }
  const data = await getContentSource().readChart(slug, id)
  if (data == null) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ slug, chartId: id, data })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug, id } = await params
  if (!SAFE_ID.test(slug) || !SAFE_ID.test(id)) {
    return NextResponse.json({ error: 'bad slug or id' }, { status: 400 })
  }
  const body = (await req.json().catch(() => null)) as { raw?: string; data?: unknown } | null
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  // Accept either a pre-parsed `data` object OR a raw JSON string to parse here
  // — the mobile editor ships the raw text so parse errors render inline.
  let data: unknown = body.data
  if (typeof body.raw === 'string') {
    try {
      data = JSON.parse(body.raw)
    } catch (e) {
      return NextResponse.json(
        { error: `JSON parse: ${e instanceof Error ? e.message : 'unknown'}` },
        { status: 400 }
      )
    }
  }
  if (data === undefined) return NextResponse.json({ error: 'missing data' }, { status: 400 })

  try {
    await getContentSource().writeChart(slug, id, data)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'write failed' },
      { status: 500 }
    )
  }
  // Chart JSON is fetched at runtime by the client, but revalidating the story
  // pages ensures any HTML-embedded chart metadata is fresh too.
  revalidatePath(`/story/${slug}`)
  revalidatePath(`/story/${slug}/share`)
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug, id } = await params
  if (!SAFE_ID.test(slug) || !SAFE_ID.test(id)) {
    return NextResponse.json({ error: 'bad slug or id' }, { status: 400 })
  }
  try {
    await getContentSource().deleteChart(slug, id)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'delete failed' },
      { status: 500 }
    )
  }
  revalidatePath(`/story/${slug}`)
  revalidatePath(`/story/${slug}/share`)
  return NextResponse.json({ ok: true })
}
