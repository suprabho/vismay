import 'server-only'

import { listPublishedHtmlStories, type PublishedHtmlStory } from '@vismay/html-stories/htmlStories'

/**
 * Published VizNBA HTML stories (migration 085, served at /s/<slug>), newest
 * first, for the Editorial grid.
 *
 * Best-effort: a listing failure (no service env) leaves the grid with its
 * recaps and news rather than an error.
 */
export async function htmlStories(): Promise<PublishedHtmlStory[]> {
  return listPublishedHtmlStories('viznba').catch((err) => {
    console.error('[html-stories] listing failed:', err)
    return []
  })
}
