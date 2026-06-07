import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isAuthed } from '@/lib/adminAuth'
import { getApp, setStoryApp } from '@vismay/content-source/apps'
import { getContentSource } from '@vismay/content-source/contentSource'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })

  // Cheapest existence check — matches the GET route's 404 semantics.
  const md = await getContentSource().readMarkdown(slug)
  if (md == null) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = (await req.json().catch(() => null)) as { appSlug?: unknown } | null
  if (!body || !('appSlug' in body)) {
    return NextResponse.json({ error: 'expected { appSlug: string | null }' }, { status: 400 })
  }

  // null unassigns the story (back to Drafts); a string must be a real app.
  const target = body.appSlug
  if (target !== null) {
    if (typeof target !== 'string' || !SAFE_SLUG.test(target)) {
      return NextResponse.json({ error: 'appSlug: bad value' }, { status: 400 })
    }
    const app = await getApp(target)
    if (!app) return NextResponse.json({ error: `unknown app: ${target}` }, { status: 400 })
  }

  try {
    await setStoryApp(slug, target as string | null)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'write failed' },
      { status: 500 }
    )
  }

  // Flush the home grids (old + new app) and this story's pages.
  revalidatePath('/')
  revalidatePath(`/story/${slug}`)
  return NextResponse.json({ ok: true, appSlug: target })
}
