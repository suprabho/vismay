import { NextResponse } from 'next/server'
import { parseHtmlStoryApp } from '@vismay/html-stories/apps'
import { getHtmlStoryForAdmin } from '@vismay/html-stories/htmlStories'
import { queueHtmlStoryShareImage } from '@vismay/html-stories/shareImage'
import { isAuthed } from '@/lib/adminAuth'

/**
 * A story's generated link-preview card (`?app=`; packages/html-stories/src/shareImage.ts):
 * GET the current card, POST to render it again (dispatches
 * render-html-story-og.yml; body `force: true` renders it even when nothing
 * changed). Publishing already queues it, so this is for a card that failed
 * or that should pick up a change outside the page (a font, an image, the
 * aura scene). Published stories only; travel stories get none.
 */

type Ctx = { params: Promise<{ slug: string }> }

export async function GET(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const app = parseHtmlStoryApp(new URL(req.url).searchParams.get('app'))
  if (!app) return NextResponse.json({ error: 'unknown app' }, { status: 400 })
  const { slug } = await params
  const story = await getHtmlStoryForAdmin(slug, app)
  if (!story) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ shareImageUrl: story.shareImageUrl })
}

export async function POST(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const app = parseHtmlStoryApp(b.app ?? new URL(req.url).searchParams.get('app'))
  if (!app) return NextResponse.json({ error: 'unknown app' }, { status: 400 })
  const { slug } = await params
  const result = await queueHtmlStoryShareImage(slug, app, { force: b.force === true })
  if (result.mode === 'failed') return NextResponse.json({ error: result.reason }, { status: 502 })
  if (result.mode === 'dispatched') return NextResponse.json({ ok: true, mode: result.mode })
  const reason = result.mode === 'unchanged' ? 'The share image is already up to date with this version.' : result.reason
  return NextResponse.json({ ok: false, mode: result.mode, reason })
}
