import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { saveHtmlStory } from '@vismay/html-stories/htmlStories'
import {
  HTML_STORY_STATUSES,
  extractHtmlMeta,
  isSafeSlug,
  lintHtml,
  slugify,
  type HtmlStoryStatus,
} from '@vismay/html-stories/meta'

/**
 * Publish endpoint for agent-authored HTML stories (see the brief in
 * packages/html-stories/src/brief.ts). Any agent that can make an HTTP request
 * posts here with `Authorization: Bearer $HTML_STORIES_TOKEN`; the admin tab
 * writes through its own session-gated route instead.
 *
 * Two body shapes:
 *   - `Content-Type: text/html` — the document itself; options in the query
 *     string (`slug`, `publish=1` or `status`, `title`, `description`, `source`).
 *   - `Content-Type: application/json` — `{ slug, html, status?, publish?,
 *     title?, description?, ogImageUrl?, source? }`.
 *
 * Without a slug, one is derived from the document's <title>. The response
 * carries lint `warnings` so the agent can fix and re-post to the same slug.
 */

export const dynamic = 'force-dynamic'

function authorized(req: Request): boolean {
  const expected = process.env.HTML_STORIES_TOKEN
  if (!expected) return false
  const got = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

interface PublishRequest {
  slug?: string
  html: string
  status?: HtmlStoryStatus
  title?: string
  description?: string
  ogImageUrl?: string
  source?: string
}

async function readBody(req: Request): Promise<PublishRequest | { error: string }> {
  const q = new URL(req.url).searchParams
  const type = req.headers.get('content-type') ?? ''
  let body: Record<string, unknown>
  if (type.includes('application/json')) {
    const json = await req.json().catch(() => null)
    if (!json || typeof json !== 'object') return { error: 'expected a JSON object' }
    body = json as Record<string, unknown>
  } else {
    body = { html: await req.text() }
  }

  const pick = (key: string): string | undefined => {
    const v = body[key] ?? q.get(key)
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
  }
  const html = body.html
  if (typeof html !== 'string') return { error: 'html is required' }

  const publish = body.publish ?? q.get('publish')
  const statusRaw = pick('status') ?? (publish === true || publish === '1' || publish === 'true' ? 'published' : undefined)
  if (statusRaw && !HTML_STORY_STATUSES.includes(statusRaw as HtmlStoryStatus)) {
    return { error: `status must be one of ${HTML_STORY_STATUSES.join(', ')}` }
  }

  return {
    html,
    slug: pick('slug'),
    status: statusRaw as HtmlStoryStatus | undefined,
    title: pick('title'),
    description: pick('description'),
    ogImageUrl: pick('ogImageUrl'),
    source: pick('source'),
  }
}

export async function POST(req: Request) {
  if (!process.env.HTML_STORIES_TOKEN) {
    return NextResponse.json({ error: 'publishing is not configured (HTML_STORIES_TOKEN unset)' }, { status: 503 })
  }
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = await readBody(req)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const lint = lintHtml(parsed.html)
  if (lint.errors.length) {
    return NextResponse.json({ error: lint.errors.join(' '), ...lint }, { status: 400 })
  }

  const slug = parsed.slug ?? slugify(parsed.title ?? extractHtmlMeta(parsed.html).title ?? '')
  if (!slug || !isSafeSlug(slug)) {
    return NextResponse.json(
      { error: 'slug must be lowercase letters, digits and single hyphens (max 80 chars)', slug },
      { status: 400 },
    )
  }

  try {
    const { story, created } = await saveHtmlStory({
      slug,
      html: parsed.html,
      status: parsed.status,
      title: parsed.title,
      description: parsed.description,
      ogImageUrl: parsed.ogImageUrl,
      source: parsed.source ? `api:${parsed.source.slice(0, 40)}` : 'api',
    })
    const url = `${new URL(req.url).origin}/s/${story.slug}`
    return NextResponse.json(
      { ok: true, created, slug: story.slug, status: story.status, title: story.title, url, warnings: lint.warnings },
      { status: created ? 201 : 200 },
    )
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'write failed' }, { status: 500 })
  }
}
