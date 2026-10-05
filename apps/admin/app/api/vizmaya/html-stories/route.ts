import { NextResponse } from 'next/server'
import { listHtmlStoriesForAdmin, saveHtmlStory } from '@vismay/html-stories/htmlStories'
import { HTML_STORY_STATUSES, isSafeSlug, lintHtml, type HtmlStoryStatus } from '@vismay/html-stories/meta'
import { isAuthed } from '@/lib/adminAuth'

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const stories = await listHtmlStoriesForAdmin()
  return NextResponse.json({ stories })
}

/** Create or replace a story's HTML from the admin editor (paste / upload). */
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'expected a JSON object' }, { status: 400 })

  if (typeof b.slug !== 'string' || !isSafeSlug(b.slug)) {
    return NextResponse.json(
      { error: 'slug must be lowercase letters, digits and single hyphens (max 80 chars)' },
      { status: 400 },
    )
  }
  if (typeof b.html !== 'string') return NextResponse.json({ error: 'html is required' }, { status: 400 })
  if (b.status != null && !HTML_STORY_STATUSES.includes(b.status as HtmlStoryStatus)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }

  const lint = lintHtml(b.html)
  if (lint.errors.length) return NextResponse.json({ error: lint.errors.join(' '), ...lint }, { status: 400 })

  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  try {
    const { story, created } = await saveHtmlStory({
      slug: b.slug,
      html: b.html,
      status: (b.status as HtmlStoryStatus | undefined) ?? undefined,
      title: str(b.title),
      description: str(b.description),
      ogImageUrl: str(b.ogImageUrl),
      source: str(b.source) === 'admin:restore' ? 'admin:restore' : 'admin',
    })
    return NextResponse.json({ ok: true, created, story, warnings: lint.warnings })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'write failed' }, { status: 500 })
  }
}
