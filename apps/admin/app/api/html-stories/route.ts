import { NextResponse } from 'next/server'
import { parseHtmlStoryApp } from '@vismay/html-stories/apps'
import { HtmlStorySlugTakenError, listHtmlStoriesForAdmin, saveHtmlStory } from '@vismay/html-stories/htmlStories'
import { HTML_STORY_STATUSES, isSafeSlug, lintHtml, parseAuraSlug, type HtmlStoryStatus } from '@vismay/html-stories/meta'
import { isAuthed } from '@/lib/adminAuth'

/**
 * Admin's session-gated HTML stories API, for every hosting app: `?app=`
 * (vizmaya-fyi — the default — or footshorts) scopes the list and the save.
 * Agents don't post here; they use each site's token-gated
 * /api/html-stories (packages/html-stories/src/publishApi.ts).
 */

export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const app = parseHtmlStoryApp(new URL(req.url).searchParams.get('app'))
  if (!app) return NextResponse.json({ error: 'unknown app' }, { status: 400 })
  const stories = await listHtmlStoriesForAdmin(app)
  return NextResponse.json({ stories })
}

/** Create or replace a story's HTML from the admin editor (paste / upload). */
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'expected a JSON object' }, { status: 400 })

  const app = parseHtmlStoryApp(b.app ?? new URL(req.url).searchParams.get('app'))
  if (!app) return NextResponse.json({ error: 'unknown app' }, { status: 400 })
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

  // A string sets the aura ('' clears it); omitted keeps the current one.
  const aura = typeof b.aura === 'string' ? (b.aura.trim() ? parseAuraSlug(b.aura) : null) : undefined
  if (aura === null && typeof b.aura === 'string' && b.aura.trim()) {
    return NextResponse.json({ error: 'aura must be an aura scene slug or an aura.promad.design scene URL' }, { status: 400 })
  }

  const lint = lintHtml(b.html)
  if (lint.errors.length) return NextResponse.json({ error: lint.errors.join(' '), ...lint }, { status: 400 })

  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  try {
    const { story, created } = await saveHtmlStory({
      slug: b.slug,
      app,
      html: b.html,
      status: (b.status as HtmlStoryStatus | undefined) ?? undefined,
      title: str(b.title),
      description: str(b.description),
      ogImageUrl: str(b.ogImageUrl),
      aura,
      source: str(b.source) === 'admin:restore' ? 'admin:restore' : 'admin',
    })
    return NextResponse.json({ ok: true, created, story, warnings: lint.warnings })
  } catch (e) {
    if (e instanceof HtmlStorySlugTakenError) return NextResponse.json({ error: e.message }, { status: 409 })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'write failed' }, { status: 500 })
  }
}
