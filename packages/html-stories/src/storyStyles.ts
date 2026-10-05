/**
 * Server-side loader for the brief's style randomizer: the palettes and font
 * trios of an app's published viz-engine stories (see ./styles). For footshorts
 * that is its editorial stories' themes (the Classic / Pitch / Terrace presets
 * and whatever editors saved).
 *
 * Server only — reads story markdown through the content source.
 */

import { getAllStories } from '@vismay/content-source/content'
import { DEFAULT_HTML_STORY_APP, type HtmlStoryApp } from './apps'
import { stylePoolFromStories, type StylePool, type ThemedStory } from './styles'

export async function loadStoryStylePool(app: HtmlStoryApp = DEFAULT_HTML_STORY_APP): Promise<StylePool> {
  const stories = await getAllStories(app)
  return stylePoolFromStories(stories as unknown as ThemedStory[])
}
