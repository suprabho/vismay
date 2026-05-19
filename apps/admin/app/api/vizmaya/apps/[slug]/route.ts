import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { getApp, listAppEpics, listAppStories } from '@vismay/content-source/apps'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })

  const app = await getApp(slug)
  if (!app) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const [epics, stories] = await Promise.all([listAppEpics(slug), listAppStories(slug)])
  return NextResponse.json({ app, epics, stories })
}
