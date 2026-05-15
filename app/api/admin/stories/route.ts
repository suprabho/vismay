import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource } from '@/lib/contentSource'

export async function GET(request: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase()
  const src = getContentSource()
  const stories = await src.listStories()
  const withTitles = await Promise.all(
    stories.map(async (s) => {
      const md = await src.readMarkdown(s.slug)
      const titleMatch = md?.match(/^title:\s*(?:"([^"]+)"|'([^']+)'|([^\n]+))/m)
      const title = titleMatch?.[1] ?? titleMatch?.[2] ?? titleMatch?.[3] ?? s.slug
      const haystack = q === '' ? '' : `${s.slug}\n${md ?? ''}`.toLowerCase()
      const match = q === '' || haystack.includes(q)
      return { story: { ...s, title: title.trim() }, match }
    })
  )
  return NextResponse.json(withTitles.filter((r) => r.match).map((r) => r.story))
}
