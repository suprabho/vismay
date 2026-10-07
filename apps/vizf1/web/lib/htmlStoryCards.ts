import 'server-only'

import type { StoryCardData } from '@vismay/ui'
import type { Theme } from '@vismay/viz-engine'
import { HTML_STORY_FORMAT_META } from '@vismay/html-stories/formats'
import { listPublishedHtmlStories } from '@vismay/html-stories/htmlStories'

/**
 * Published vizf1 HTML stories (migration 085, served at /s/<slug>) shaped as
 * story cards for the Editorial grid, newest first.
 *
 * Best-effort: a listing failure (no service env) leaves the grid with its
 * viz-engine stories rather than an error.
 */
export async function getHtmlStoryCards(): Promise<StoryCardData[]> {
  const stories = await listPublishedHtmlStories('vizf1').catch((err) => {
    console.error('[html-stories] listing failed:', err)
    return []
  })
  return stories.map((s) => {
    const c = s.theme
    // The card reads background / text / muted / accent; fonts stay the
    // grid's own (empty names fall through to its defaults).
    const theme: Theme | undefined = c
      ? {
          colors: {
            background: c.background!,
            surface: c.surface ?? c.background!,
            text: c.text!,
            muted: c.muted!,
            accent: c.accent!,
            accent2: c.accent2!,
            teal: c.teal!,
            ...(c.line ? { line: c.line } : {}),
          },
          fonts: { serif: '', sans: '', mono: '' },
        }
      : undefined
    return {
      slug: s.slug,
      href: `/s/${s.slug}`,
      title: s.title,
      subtitle: s.description ?? '',
      date: s.publishedAt ?? s.updatedAt,
      byline: '',
      theme,
      aura: s.aura ?? undefined,
      thumbnail: s.ogImageUrl ?? undefined,
      // A book, board or deck says so on its card; a scrolling page needs no badge.
      format: s.format !== 'scroll' ? HTML_STORY_FORMAT_META[s.format].label : undefined,
    }
  })
}
