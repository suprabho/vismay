import type { Storyboard } from './types'
import { carrickUnited } from './carrick-united'

/** Registry of native footshorts storyboards, keyed by slug. */
export const storyboards: Record<string, Storyboard> = {
  [carrickUnited.slug]: carrickUnited,
}

export function getStoryboard(slug: string): Storyboard | undefined {
  return storyboards[slug]
}

export function listStoryboards(): Storyboard[] {
  return Object.values(storyboards)
}
