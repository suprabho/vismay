/**
 * NBA RSS source registry. Each entry must be an officially published feed
 * (NOT a scraped page) so commercial terms stay clean.
 *
 * Tier 1 = wire / mainstream, Tier 2 = NBA-first specialists.
 * Verify URLs before adding — feeds break silently when sites redesign.
 * Body length varies a lot: Yahoo, Hoops Rumors, NBC and Fox ship the full
 * article in the feed; ESPN and CBS ship one-sentence descriptions, so their
 * summaries lean on the headline.
 */

export type RssSource = {
  id: string
  publisher: string
  feedUrl: string
  tier: 1 | 2
}

export const RSS_SOURCES: RssSource[] = [
  // Tier 1 — wire + mainstream sport
  {
    id: 'espn-nba',
    publisher: 'ESPN',
    feedUrl: 'https://www.espn.com/espn/rss/nba/news',
    tier: 1,
  },
  {
    id: 'cbs-nba',
    publisher: 'CBS Sports',
    feedUrl: 'https://www.cbssports.com/rss/headlines/nba/',
    tier: 1,
  },
  {
    id: 'yahoo-nba',
    publisher: 'Yahoo Sports',
    feedUrl: 'https://sports.yahoo.com/nba/rss/',
    tier: 1,
  },
  {
    id: 'nbc-nba',
    publisher: 'NBC Sports',
    feedUrl: 'https://www.nbcsports.com/nba.rss',
    tier: 1,
  },
  {
    id: 'fox-nba',
    publisher: 'FOX Sports',
    feedUrl:
      'https://api.foxsports.com/v2/content/optimized-rss?partnerKey=MB0Wehpmuj2lUhuRhQaafhBjAJqaPU244mlTDK1i&size=30&tags=fs/nba',
    tier: 1,
  },
  {
    id: 'guardian-nba',
    publisher: 'The Guardian',
    feedUrl: 'https://www.theguardian.com/sport/nba/rss',
    tier: 1,
  },

  // Tier 2 — NBA-first publications
  {
    id: 'hoopsrumors',
    publisher: 'Hoops Rumors',
    feedUrl: 'https://www.hoopsrumors.com/feed',
    tier: 2,
  },
  {
    id: 'realgm-wiretap',
    publisher: 'RealGM',
    feedUrl: 'https://basketball.realgm.com/rss/wiretap/0/0.xml',
    tier: 2,
  },
  {
    id: 'sbnation-nba',
    publisher: 'SB Nation',
    feedUrl: 'https://www.sbnation.com/rss/nba/index.xml',
    tier: 2,
  },
]
