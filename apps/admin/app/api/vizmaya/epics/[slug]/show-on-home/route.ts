import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isAuthed } from '@/lib/adminAuth'
import { getEpicForAdmin, setEpicShowOnHome } from '@vismay/content-source/epics'

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

  const body = (await req.json().catch(() => null)) as { showOnHome?: unknown } | null
  if (!body || typeof body.showOnHome !== 'boolean') {
    return NextResponse.json({ error: 'expected { showOnHome: boolean }' }, { status: 400 })
  }

  try {
    await setEpicShowOnHome(slug, body.showOnHome)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'write failed' },
      { status: 500 }
    )
  }

  // The home page reads listEpicsForHome() — flush root so the grid updates.
  revalidatePath('/')
  return NextResponse.json({ ok: true, showOnHome: body.showOnHome })
}
