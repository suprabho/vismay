/**
 * Server-side loader for the brief's style randomizer: the palettes and font
 * trios of an app's published viz-engine stories (see ./styles). For footshorts
 * that is its editorial stories' themes (the Classic / Pitch / Terrace presets
 * and whatever editors saved).
 *
 * Server only — reads story markdown through the content source.
 */

import { getAllStories } from '@vismay/content-source/content'
import { listCompetitionStoryStyles } from '@vismay/content-source/footshortsData'
import { DEFAULT_HTML_STORY_APP, type HtmlStoryApp } from './apps'
import {
  parseCompetitionStyle,
  stylePoolFromStories,
  type CompetitionStyleOption,
  type StylePool,
  type ThemedStory,
} from './styles'

export async function loadStoryStylePool(app: HtmlStoryApp = DEFAULT_HTML_STORY_APP): Promise<StylePool> {
  const stories = await getAllStories(app)
  return stylePoolFromStories(stories as unknown as ThemedStory[])
}

/**
 * The competition styles set in the footshorts Asset Studio
 * (`entities.story_style`), for the brief's "Competition style" picker. Only
 * footshorts has competitions; other apps get an empty list. Rows that no
 * longer validate are skipped rather than handed to an agent.
 */
export async function loadCompetitionStyles(app: HtmlStoryApp = DEFAULT_HTML_STORY_APP): Promise<CompetitionStyleOption[]> {
  if (app !== 'footshorts') return []
  const rows = await listCompetitionStoryStyles()
  return rows.flatMap((r) => {
    const parsed = parseCompetitionStyle(r.style)
    return 'style' in parsed ? [{ slug: r.slug, name: r.name, crestUrl: r.crestUrl, style: parsed.style }] : []
  })
}

/** One competition's style by slug (footshorts only), or null when it has none. */
export async function loadCompetitionStyle(app: HtmlStoryApp, slug: string): Promise<CompetitionStyleOption | null> {
  return (await loadCompetitionStyles(app)).find((c) => c.slug === slug) ?? null
}
