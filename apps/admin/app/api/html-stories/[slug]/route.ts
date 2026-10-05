import { NextResponse } from 'next/server'
import { parseHtmlStoryApp } from '@vismay/html-stories/apps'
import {
  deleteHtmlStory,
  getHtmlStoryForAdmin,
  listHtmlStoryVersions,
  updateHtmlStoryMeta,
} from '@vismay/html-stories/htmlStories'
import { HTML_STORY_STATUSES, lintHtml, parseAuraSlug, type HtmlStoryStatus } from '@vismay/html-stories/meta'
import { isAuthed } from '@/lib/adminAuth'

type Ctx = { params: Promise<{ slug: string }> }

/** One app's story (`?app=`); another app's story with the same slug is a 404 here. */
export async function GET(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const app = parseHtmlStoryApp(new URL(req.url).searchParams.get('app'))
  if (!app) return NextResponse.json({ error: 'unknown app' }, { status: 400 })
  const { slug } = await params
  const story = await getHtmlStoryForAdmin(slug, app)
  if (!story) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const versions = await listHtmlStoryVersions(slug, 50, app)
  return NextResponse.json({ story, versions, lint: lintHtml(story.html) })
}

/** Status / metadata only; HTML changes go through POST /api/html-stories. */
export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'expected a JSON object' }, { status: 400 })
  const app = parseHtmlStoryApp(b.app ?? new URL(req.url).searchParams.get('app'))
  if (!app) return NextResponse.json({ error: 'unknown app' }, { status: 400 })

  const patch: Parameters<typeof updateHtmlStoryMeta>[1] = {}
  if (b.status !== undefined) {
    if (!HTML_STORY_STATUSES.includes(b.status as HtmlStoryStatus)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 })
    }
    patch.status = b.status as HtmlStoryStatus
  }
  if (typeof b.title === 'string' && b.title.trim()) patch.title = b.title.trim()
  if (b.description !== undefined) patch.description = typeof b.description === 'string' && b.description.trim() ? b.description.trim() : null
  if (b.ogImageUrl !== undefined) patch.ogImageUrl = typeof b.ogImageUrl === 'string' && b.ogImageUrl.trim() ? b.ogImageUrl.trim() : null
  if (b.aura !== undefined) {
    const raw = typeof b.aura === 'string' ? b.aura.trim() : ''
    const aura = raw ? parseAuraSlug(raw) : null
    if (raw && !aura) {
      return NextResponse.json({ error: 'aura must be an aura scene slug or an aura.promad.design scene URL' }, { status: 400 })
    }
    patch.aura = aura
  }

  try {
    const story = await updateHtmlStoryMeta(slug, patch, app)
    if (!story) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true, story })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'write failed' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const app = parseHtmlStoryApp(new URL(req.url).searchParams.get('app'))
  if (!app) return NextResponse.json({ error: 'unknown app' }, { status: 400 })
  const { slug } = await params
  try {
    await deleteHtmlStory(slug, app)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'delete failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
