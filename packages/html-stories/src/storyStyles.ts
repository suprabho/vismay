/**
 * Server-side loader for the brief's style randomizer: the palettes and font
 * trios of the published vizmaya-fyi stories (see ./styles).
 *
 * Server only — reads story markdown through the content source.
 */

import { getAllStories } from '@vismay/content-source/content'
import { stylePoolFromStories, type StylePool, type ThemedStory } from './styles'

export async function loadStoryStylePool(): Promise<StylePool> {
  const stories = await getAllStories('vizmaya-fyi')
  return stylePoolFromStories(stories as unknown as ThemedStory[])
}
