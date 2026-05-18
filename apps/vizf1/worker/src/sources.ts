/**
 * F1 RSS source registry. Each entry must be an officially published feed
 * (NOT a scraped page) so commercial terms stay clean.
 *
 * Tier 1 = wire / mainstream, Tier 2 = F1-first specialists, Tier 3 = fan-led.
 * Verify URLs before launch — feeds break silently when sites redesign.
 */

export type RssSource = {
  id: string
  publisher: string
  feedUrl: string
  tier: 1 | 2 | 3
}

export const RSS_SOURCES: RssSource[] = [
  // Tier 1 — wire + mainstream sport
  {
    id: 'bbc-sport-f1',
    publisher: 'BBC Sport',
    feedUrl: 'https://feeds.bbci.co.uk/sport/formula1/rss.xml',
    tier: 1,
  },
  {
    id: 'guardian-f1',
    publisher: 'The Guardian',
    feedUrl: 'https://www.theguardian.com/sport/formulaone/rss',
    tier: 1,
  },
  {
    id: 'espn-f1',
    publisher: 'ESPN F1',
    feedUrl: 'https://www.espn.com/espn/rss/f1/news',
    tier: 1,
  },

  // Tier 2 — F1-first publications
  {
    id: 'autosport-f1',
    publisher: 'Autosport',
    feedUrl: 'https://www.autosport.com/rss/feed/f1',
    tier: 2,
  },
  {
    id: 'motorsport-f1',
    publisher: 'Motorsport.com',
    feedUrl: 'https://www.motorsport.com/rss/f1/news/',
    tier: 2,
  },
  {
    id: 'the-race-f1',
    publisher: 'The Race',
    feedUrl: 'https://the-race.com/rss',
    tier: 2,
  },
  {
    id: 'racefans',
    publisher: 'RaceFans',
    feedUrl: 'https://www.racefans.net/feed/',
    tier: 2,
  },
]
