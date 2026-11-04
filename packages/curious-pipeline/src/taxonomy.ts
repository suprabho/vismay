/**
 * The Curious Desk's editorial taxonomy: eras, regions and themes the
 * extractor assigns and the desk's reels draw from. packages/randomizer's
 * data/curious.json carries the same ids with their reel copy; a test pins
 * the two lists equal.
 */

export interface Era {
  id: string
  name: string
  from: number | null
  to: number | null
}

export const ERAS: readonly Era[] = [
  { id: 'antiquity', name: 'Antiquity', from: null, to: 499 },
  { id: 'medieval', name: 'Medieval', from: 500, to: 1449 },
  { id: 'early-modern', name: 'Early modern', from: 1450, to: 1789 },
  { id: 'long-19th', name: 'The long nineteenth century', from: 1790, to: 1913 },
  { id: 'world-wars', name: 'The world wars', from: 1914, to: 1945 },
  { id: 'postwar', name: 'Postwar', from: 1946, to: 1979 },
  { id: 'late-20th', name: 'Late twentieth century', from: 1980, to: 1999 },
  { id: 'recent', name: 'Recent', from: 2000, to: null },
]

export const REGION_IDS = ['europe', 'north-america', 'latin-america', 'middle-east-north-africa', 'sub-saharan-africa', 'south-asia', 'east-asia', 'southeast-asia-oceania', 'world'] as const
export type RegionId = (typeof REGION_IDS)[number]

export const THEME_IDS = ['science-invention', 'arts-music', 'film-tv', 'food-drink', 'sport-games', 'words-language', 'money-trade', 'war-peace', 'law-crime', 'cities-buildings', 'nature-animals', 'travel-transport'] as const
export type ThemeId = (typeof THEME_IDS)[number]

export const THEME_NAMES: Record<ThemeId, string> = {
  'science-invention': 'Science and invention',
  'arts-music': 'Arts and music',
  'film-tv': 'Film and television',
  'food-drink': 'Food and drink',
  'sport-games': 'Sport and games',
  'words-language': 'Words and language',
  'money-trade': 'Money and trade',
  'war-peace': 'War and peace',
  'law-crime': 'Law and crime',
  'cities-buildings': 'Cities and buildings',
  'nature-animals': 'Nature and animals',
  'travel-transport': 'Travel and transport',
}

/** The era a year falls in (astronomical years: -383 is 384 BCE); null when unknown. */
export function eraOf(year: number | null | undefined): string | null {
  if (year == null || !Number.isFinite(year)) return null
  for (const e of ERAS) if ((e.from == null || year >= e.from) && (e.to == null || year <= e.to)) return e.id
  return null
}
