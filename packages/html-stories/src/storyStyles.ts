/**
 * Server-side loader for the brief's style randomizer: the palettes and font
 * trios of an app's published viz-engine stories (see ./styles). For footshorts
 * that is its editorial stories' themes (the Classic / Pitch / Terrace presets
 * and whatever editors saved).
 *
 * Server only — reads story markdown through the content source.
 */

import { getAllStories } from '@vismay/content-source/content'
import { listEntityStoryStyles } from '@vismay/content-source/footshortsData'
import { DEFAULT_HTML_STORY_APP, type HtmlStoryApp } from './apps'
import {
  parseEntityStyle,
  stylePoolFromStories,
  type EntityStyleKind,
  type EntityStyleOption,
  type StylePool,
  type ThemedStory,
} from './styles'

export async function loadStoryStylePool(app: HtmlStoryApp = DEFAULT_HTML_STORY_APP): Promise<StylePool> {
  const stories = await getAllStories(app)
  return stylePoolFromStories(stories as unknown as ThemedStory[])
}

/**
 * The competition and team styles set in the footshorts Asset Studio
 * (`entities.story_style`), for the brief's "Story style" picker. Only
 * footshorts has them; other apps get an empty list. Rows that no longer
 * validate are skipped rather than handed to an agent.
 */
export async function loadEntityStyles(app: HtmlStoryApp = DEFAULT_HTML_STORY_APP): Promise<EntityStyleOption[]> {
  if (app !== 'footshorts') return []
  const rows = await listEntityStoryStyles()
  return rows.flatMap((r) => {
    const parsed = parseEntityStyle(r.style)
    if (!('style' in parsed)) return []
    const kind: EntityStyleKind = r.type === 'league' ? 'competition' : 'team'
    return [{ kind, slug: r.slug, name: r.name, crestUrl: r.crestUrl, style: parsed.style }]
  })
}

/** One competition's or team's style by slug (footshorts only), or null when it has none. */
export async function loadEntityStyle(app: HtmlStoryApp, kind: EntityStyleKind, slug: string): Promise<EntityStyleOption | null> {
  return (await loadEntityStyles(app)).find((o) => o.kind === kind && o.slug === slug) ?? null
}
