/**
 * Story categories: the one subject area a story is filed under, which is
 * how the vizmaya.fyi home page groups stories into sections.
 *
 * A category is picked at publish (`category` on the publish API and the MCP
 * tool) or set in the admin editor, and kept in `html_stories.category`
 * (migration 105), never in the document. Viz-engine stories carry the same
 * ids in their own listing. Pure, so the client can import it.
 */

export interface StoryCategory {
  id: string
  /** The name as a listing prints it. */
  label: string
  /** What belongs here, for the agent brief and the admin picker. */
  covers: string
}

/** In the order the home page shows them. */
export const STORY_CATEGORIES = [
  {
    id: 'economy',
    label: 'Economy & Business',
    covers: 'Markets, companies, filings, trade, commodities, money and how firms make it.',
  },
  {
    id: 'ai-tech',
    label: 'AI & Technology',
    covers: 'AI research and papers, chips, compute and data centres, robots, software and the technology industry.',
  },
  {
    id: 'politics',
    label: 'Politics & World',
    covers: 'Elections, governments, policy, war, diplomacy and geopolitics.',
  },
  {
    id: 'science',
    label: 'Science',
    covers: 'Physics, chemistry, biology, mathematics, space, the earth and the environment.',
  },
  {
    id: 'history',
    label: 'History & Culture',
    covers: 'The past, its people and places, archaeology, myth and epics, books, arts and how people live.',
  },
  {
    id: 'society',
    label: 'Society & Health',
    covers: 'Health and medicine, education, work, demographics, and research on how people behave.',
  },
] as const satisfies readonly StoryCategory[]

export type StoryCategoryId = (typeof STORY_CATEGORIES)[number]['id']

export const STORY_CATEGORY_IDS: readonly StoryCategoryId[] = STORY_CATEGORIES.map((c) => c.id)

export function isStoryCategory(value: unknown): value is StoryCategoryId {
  return typeof value === 'string' && (STORY_CATEGORY_IDS as readonly string[]).includes(value)
}

/** A category id from what someone typed: the id, or the label in any case. */
export function parseStoryCategory(value: string | null | undefined): StoryCategoryId | null {
  const v = value?.trim().toLowerCase()
  if (!v) return null
  if (isStoryCategory(v)) return v
  return STORY_CATEGORIES.find((c) => c.label.toLowerCase() === v)?.id ?? null
}

export function storyCategoryLabel(id: string | null | undefined): string | undefined {
  return STORY_CATEGORIES.find((c) => c.id === id)?.label
}
