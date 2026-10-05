import { NextResponse } from 'next/server'
import { parseHtmlStoryApp } from '@vismay/html-stories/apps'
import { getHtmlStoryVersionHtml } from '@vismay/html-stories/htmlStories'
import { isAuthed } from '@/lib/adminAuth'

/** One earlier version's HTML, for preview and restore in the editor. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const app = parseHtmlStoryApp(new URL(req.url).searchParams.get('app'))
  if (!app) return NextResponse.json({ error: 'unknown app' }, { status: 400 })
  const { slug, id } = await params
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0) return NextResponse.json({ error: 'bad version id' }, { status: 400 })
  const html = await getHtmlStoryVersionHtml(slug, n, app)
  if (html == null) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ html })
}
