import type { DomainPack } from './types'

/**
 * The Travel desk — personal trip scrapbooks (`apps/travel/web`), map-format
 * stories where each section is one spread over a persistent map.
 *
 * `extraLayerTypes` is deliberately EMPTY: scrapbook visuals (polaroids, tape
 * notes, tickets, postmarks, curated photos) are injection-owned —
 * `@vismay/content-source/travelScrapbook` builds every layer at render time
 * from the `scrapbook:` block + curated media, and the compose route writes
 * the camera + scrapbook blocks deterministically from the itinerary. The AI
 * only ever writes prose here, which also sidesteps the map-format schema's
 * no-vertical-layers rule. The admin section pass is forced to
 * phase:'content' for this pack (the VISUAL pass would replace the section
 * body and drop `scrapbook:`).
 */
export const TRAVEL_PACK: DomainPack = {
  id: 'travel',
  name: 'Travel',
  persona:
    'You are writing a personal travel scrapbook — a warm, first-person recollection of one ' +
    'day of a real trip, for the friends and family who were there or wish they had been. ' +
    'Write like a postcard home, not a guidebook: specific, unhurried, a little wry. ',
  contentGuidance:
    'Each section is one scrapbook spread about one stop of the day. Write 1–2 SHORT ' +
    'past-tense paragraphs (2–4 sentences total) recalling that stop — what it was like to ' +
    'be there, one concrete detail worth keeping. Ground every fact strictly in the ' +
    'itinerary notes, tips, and photo captions provided; NEVER invent places, times, people, ' +
    'or events. Do not restate the stop name as an opening (the spread already carries it), ' +
    'do not enumerate logistics (times/addresses), and do not mention photos — they sit ' +
    'beside the prose on the spread.',
  bylineExample: 'A travel scrapbook',
  formats: ['map'],
  extraLayerTypes: [],
}
