import { NextResponse } from 'next/server'
import { parseHtmlStoryApp } from '@vismay/html-stories/apps'
import { getHtmlStoryAudio, playableHtmlStoryAudio, queueHtmlStoryAudio } from '@vismay/html-stories/audio'
import { getHtmlStoryForAdmin } from '@vismay/html-stories/htmlStories'
import { isAuthed } from '@/lib/adminAuth'

/**
 * A story's section audio (`?app=`): GET the manifest (and whether it was made
 * from the HTML now stored, i.e. whether /s/<slug> offers the player), POST to
 * voice it (dispatches render-html-story-audio.yml; body `force: true`
 * re-voices every section, else unchanged clips are reused). This is the only
 * way audio gets made: publishing doesn't queue it. Published stories only;
 * travel stories get no audio.
 */

type Ctx = { params: Promise<{ slug: string }> }

export async function GET(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const app = parseHtmlStoryApp(new URL(req.url).searchParams.get('app'))
  if (!app) return NextResponse.json({ error: 'unknown app' }, { status: 400 })
  const { slug } = await params
  const story = await getHtmlStoryForAdmin(slug, app)
  if (!story) return NextResponse.json({ error: 'not found' }, { status: 404 })
  try {
    const audio = await getHtmlStoryAudio(slug)
    return NextResponse.json({ audio, current: !!playableHtmlStoryAudio(audio, story.html) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'read failed' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const app = parseHtmlStoryApp(b.app ?? new URL(req.url).searchParams.get('app'))
  if (!app) return NextResponse.json({ error: 'unknown app' }, { status: 400 })
  const { slug } = await params
  const story = await getHtmlStoryForAdmin(slug, app)
  if (!story) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (story.status !== 'published') return NextResponse.json({ error: 'publish the story first' }, { status: 409 })
  const result = await queueHtmlStoryAudio({ slug, app, html: story.html }, { force: b.force === true })
  if (result.mode === 'failed') return NextResponse.json({ error: result.reason }, { status: 502 })
  if (result.mode === 'skipped' || result.mode === 'unconfigured' || result.mode === 'unchanged') {
    if (result.mode === 'unchanged') return NextResponse.json({ ok: false, mode: result.mode, reason: 'The audio is already up to date with this version.' })
    return NextResponse.json({ ok: false, mode: result.mode, reason: result.reason })
  }
  return NextResponse.json({ ok: true, mode: result.mode })
}
