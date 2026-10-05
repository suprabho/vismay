import type { Theme } from '@vismay/viz-engine'
import type { StoryCardData } from '@vismay/ui'
import { listPublishedHtmlStories } from '@vismay/html-stories/htmlStories'

/**
 * Published HTML stories (migration 085, served at /s/<slug>) shaped as
 * story cards, newest first, for the home grid and the /stories archive.
 *
 * Best-effort: a listing failure (no service env, migration 086 not applied
 * yet) leaves the pages with their viz-engine stories rather than a 500.
 */
export async function getHtmlStoryCards(): Promise<StoryCardData[]> {
  const stories = await listPublishedHtmlStories('vizmaya-fyi').catch((err) => {
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
      // With an aura the card plays it (StoryCard's default priority); the
      // og:image stays as the thumbnail for stories without one.
      aura: s.aura ?? undefined,
      thumbnail: s.ogImageUrl ?? undefined,
    }
  })
}
