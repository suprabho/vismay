/**
 * The travel app's HTML stories (packages/html-stories, `app_slug = 'travel'`):
 * agent-authored pages, each belonging to one trip (its
 * `<meta name="travel:trip">`, which the publish lint requires) and served at
 * `/s/<slug>` only to visitors holding that trip's password.
 *
 * DB-first like the rest of the app: a row in `html_stories` wins, and a
 * draft or archived row hides the story. With no row (or no Supabase env,
 * or a failed read) the git copy in `content/html-stories/<slug>.html` is the
 * fallback, the same seed-archive posture as the scrapbook's md/config.
 * `pnpm travel:sync-html-story` seeds a git copy into the table.
 *
 * Server only.
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  getHtmlStoryForAdmin,
  hasServiceEnv,
  listPublishedHtmlStories,
} from '@vismay/html-stories/htmlStories'
import { extractHtmlMeta, extractTripMeta, isSafeSlug, isTripStorySlug } from '@vismay/html-stories/meta'

const HTML_STORIES_DIR =
  process.env.HTML_STORY_CONTENT_DIR || path.join(process.cwd(), 'content/html-stories')

export interface TripHtmlStory {
  slug: string
  /** The trip the page names; the gate checks this trip's password. */
  trip: string
  title: string
  html: string
  aura: string | null
  updatedAt: string
}

function readGitStory(slug: string): TripHtmlStory | null {
  const file = path.join(HTML_STORIES_DIR, `${slug}.html`)
  if (!fs.existsSync(file)) return null
  try {
    const html = fs.readFileSync(file, 'utf8')
    const trip = extractTripMeta(html)
    if (!trip || !isTripStorySlug(slug, trip)) {
      console.warn(`[travel] ${file} has no matching <meta name="travel:trip">; not served`)
      return null
    }
    return {
      slug,
      trip,
      title: extractHtmlMeta(html).title ?? slug,
      html,
      aura: null,
      updatedAt: fs.statSync(file).mtime.toISOString(),
    }
  } catch (e) {
    console.warn(`[travel] failed to read ${file}:`, e)
    return null
  }
}

/** The published story for `/s/<slug>`, or null (unknown, draft, archived, or no trip). */
export async function getTripHtmlStory(slug: string): Promise<TripHtmlStory | null> {
  if (!isSafeSlug(slug)) return null
  if (hasServiceEnv()) {
    try {
      const row = await getHtmlStoryForAdmin(slug, 'travel')
      if (row) {
        if (row.status !== 'published') return null
        const trip = extractTripMeta(row.html)
        // The publish lint enforces both; a row that predates it is not served.
        if (!trip || !isTripStorySlug(slug, trip)) return null
        return { slug, trip, title: row.title, html: row.html, aura: row.aura, updatedAt: row.updatedAt }
      }
    } catch (e) {
      console.warn(`[travel] html_stories read failed for ${slug}, using the git copy:`, e)
    }
  }
  return readGitStory(slug)
}

export interface TripHtmlStoryLink {
  slug: string
  title: string
}

/**
 * A trip's published HTML stories, for its journey page to link: the
 * database's under the trip's slug plus the git copies, each resolved through
 * getTripHtmlStory (so a draft row hides its git copy) and kept only when the
 * page names this trip.
 */
export async function listTripHtmlStories(trip: string): Promise<TripHtmlStoryLink[]> {
  const slugs = new Set(gitSlugs(trip))
  if (hasServiceEnv()) {
    try {
      for (const s of await listPublishedHtmlStories('travel')) {
        if (isTripStorySlug(s.slug, trip)) slugs.add(s.slug)
      }
    } catch (e) {
      console.warn(`[travel] html_stories listing failed for ${trip}:`, e)
    }
  }
  const out: TripHtmlStoryLink[] = []
  for (const slug of [...slugs].sort()) {
    const story = await getTripHtmlStory(slug)
    if (story?.trip === trip) out.push({ slug, title: story.title })
  }
  return out
}

function gitSlugs(trip: string): string[] {
  if (!fs.existsSync(HTML_STORIES_DIR)) return []
  return fs
    .readdirSync(HTML_STORIES_DIR)
    .filter((f) => f.endsWith('.html'))
    .map((f) => f.slice(0, -'.html'.length))
    .filter((slug) => isSafeSlug(slug) && isTripStorySlug(slug, trip))
    .sort()
}
