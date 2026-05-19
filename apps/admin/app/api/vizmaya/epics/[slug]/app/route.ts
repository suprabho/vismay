import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isAuthed } from '@/lib/adminAuth'
import { getEpicForAdmin, setEpicApp } from '@/lib/epics'
import { getApp } from '@/lib/apps'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })

  const epic = await getEpicForAdmin(slug)
  if (!epic) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = (await req.json().catch(() => null)) as { appSlug?: unknown } | null
  if (!body || typeof body.appSlug !== 'string' || !SAFE_SLUG.test(body.appSlug)) {
    return NextResponse.json({ error: 'expected { appSlug: string }' }, { status: 400 })
  }

  const app = await getApp(body.appSlug)
  if (!app) return NextResponse.json({ error: `unknown app: ${body.appSlug}` }, { status: 400 })

  try {
    await setEpicApp(slug, body.appSlug)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'write failed' },
      { status: 500 }
    )
  }

  revalidatePath(`/${slug}`)
  return NextResponse.json({ ok: true, appSlug: body.appSlug })
}
