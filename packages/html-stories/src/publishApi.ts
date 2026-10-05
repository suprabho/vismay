/**
 * The token-gated publish endpoint for agent-authored HTML stories (see the
 * brief in ./brief.ts), shared by every site that hosts them: the route
 * handler in each app is one line, and the contract is identical everywhere.
 * Any agent that can make an HTTP request posts here with
 * `Authorization: Bearer $HTML_STORIES_TOKEN`; the admin tab writes through its
 * own session-gated route instead.
 *
 * Two body shapes:
 *   - `Content-Type: text/html` — the document itself; options in the query
 *     string (`slug`, `publish=1` or `status`, `title`, `description`, `aura`,
 *     `source`).
 *   - `Content-Type: application/json` — `{ slug, html, status?, publish?,
 *     title?, description?, ogImageUrl?, aura?, source? }`.
 *
 * `aura` is an aura.promad.design scene slug (or scene URL) laid behind the
 * page and on its listing card. Omitted, a re-post keeps the story's aura.
 *
 * Without a slug, one is derived from the document's <title>. The response
 * carries lint `warnings` so the agent can fix and re-post to the same slug.
 *
 * Server only.
 */

import { timingSafeEqual } from 'node:crypto'
import type { HtmlStoryApp } from './apps'
import { HtmlStorySlugTakenError, saveHtmlStory } from './htmlStories'
import {
  HTML_STORY_STATUSES,
  extractHtmlMeta,
  isSafeSlug,
  lintHtml,
  parseAuraSlug,
  slugify,
  type HtmlStoryStatus,
} from './meta'

/** Each deployment's own token; set it on that app's Vercel project. */
export const HTML_STORIES_TOKEN_ENV = 'HTML_STORIES_TOKEN'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

/** Constant-time check of the bearer token against the deployment's. False when the token is unset. */
export function isHtmlStoriesTokenRequest(req: Request): boolean {
  const expected = process.env[HTML_STORIES_TOKEN_ENV]
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
  aura?: string
  source?: string
}

async function readBody(req: Request): Promise<PublishRequest | { error: string }> {
  const q = new URL(req.url).searchParams
  const type = req.headers.get('content-type') ?? ''
  let body: Record<string, unknown>
  if (type.includes('application/json')) {
    const parsed = await req.json().catch(() => null)
    if (!parsed || typeof parsed !== 'object') return { error: 'expected a JSON object' }
    body = parsed as Record<string, unknown>
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

  const auraRaw = pick('aura')
  const aura = auraRaw ? parseAuraSlug(auraRaw) : undefined
  if (auraRaw && !aura) return { error: 'aura must be an aura scene slug or an aura.promad.design scene URL' }

  return {
    html,
    aura: aura ?? undefined,
    slug: pick('slug'),
    status: statusRaw as HtmlStoryStatus | undefined,
    title: pick('title'),
    description: pick('description'),
    ogImageUrl: pick('ogImageUrl'),
    source: pick('source'),
  }
}

/** POST /api/html-stories for one app. */
export async function handleHtmlStoryPublish(req: Request, app: HtmlStoryApp): Promise<Response> {
  if (!process.env[HTML_STORIES_TOKEN_ENV]) {
    return json({ error: `publishing is not configured (${HTML_STORIES_TOKEN_ENV} unset)` }, 503)
  }
  if (!isHtmlStoriesTokenRequest(req)) return json({ error: 'unauthorized' }, 401)

  const parsed = await readBody(req)
  if ('error' in parsed) return json({ error: parsed.error }, 400)

  const lint = lintHtml(parsed.html)
  if (lint.errors.length) return json({ error: lint.errors.join(' '), ...lint }, 400)

  const slug = parsed.slug ?? slugify(parsed.title ?? extractHtmlMeta(parsed.html).title ?? '')
  if (!slug || !isSafeSlug(slug)) {
    return json({ error: 'slug must be lowercase letters, digits and single hyphens (max 80 chars)', slug }, 400)
  }

  try {
    const { story, created } = await saveHtmlStory({
      slug,
      app,
      html: parsed.html,
      status: parsed.status,
      title: parsed.title,
      description: parsed.description,
      ogImageUrl: parsed.ogImageUrl,
      aura: parsed.aura,
      source: parsed.source ? `api:${parsed.source.slice(0, 40)}` : 'api',
    })
    const url = `${new URL(req.url).origin}/s/${story.slug}`
    return json(
      { ok: true, created, slug: story.slug, status: story.status, title: story.title, url, warnings: lint.warnings },
      created ? 201 : 200,
    )
  } catch (e) {
    if (e instanceof HtmlStorySlugTakenError) return json({ error: e.message, slug }, 409)
    return json({ error: e instanceof Error ? e.message : 'write failed' }, 500)
  }
}
