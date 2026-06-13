import { NextResponse, type NextRequest } from 'next/server'
import matter from 'gray-matter'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource } from '@vismay/content-source/contentSource'

export async function GET(request: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase()
  const appFilter = (request.nextUrl.searchParams.get('app') ?? '').trim()
  const src = getContentSource()
  const stories = await src.listStories()
  const filteredByApp = appFilter ? stories.filter((s) => s.appSlug === appFilter) : stories
  // We already read each story's markdown, so parse the full frontmatter once and
  // surface the rich card fields the admin home grid needs (subtitle, date,
  // topic, theme, thumbnail, aura). The list/footshorts views ignore the extras.
  const withMeta = await Promise.all(
    filteredByApp.map(async (s) => {
      const md = await src.readMarkdown(s.slug)
      const data = md ? (matter(md).data as Record<string, unknown>) : {}
      const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
      const title = str(data.title)?.trim() || s.slug
      const haystack = q === '' ? '' : `${s.slug}\n${md ?? ''}`.toLowerCase()
      const match = q === '' || haystack.includes(q)
      return {
        story: {
          ...s,
          title,
          subtitle: str(data.subtitle) ?? '',
          date: str(data.date) ?? '',
          byline: str(data.byline) ?? '',
          topic: str(data.topic),
          theme: (data.theme as unknown) ?? undefined,
          aura: str(data.aura),
          thumbnail: str(data.thumbnail),
          thumbnailTextColor: str(data.thumbnailTextColor),
        },
        match,
      }
    })
  )
  return NextResponse.json(withMeta.filter((r) => r.match).map((r) => r.story))
}
