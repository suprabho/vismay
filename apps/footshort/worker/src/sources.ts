/**
 * RSS source registry.
 * Each source must be an RSS/Atom feed explicitly published by the outlet
 * for syndication — NOT a scraped page. This gives us clean commercial terms.
 *
 * Verify each feed before launch (URLs can change).
 * Tier 1 = wire/reputable, Tier 2 = fan sites / club official, Tier 3 = specialist
 */

export type RssSource = {
  id: string;              // stable slug
  publisher: string;       // display name
  feedUrl: string;
  tier: 1 | 2 | 3;
  scope: 'global' | 'english' | 'european' | 'club';
  clubSlug?: string;       // for club-specific feeds
};

export const RSS_SOURCES: RssSource[] = [
  // Tier 1 — major outlets
  {
    id: 'bbc-sport-football',
    publisher: 'BBC Sport',
    feedUrl: 'https://feeds.bbci.co.uk/sport/football/rss.xml',
    tier: 1,
    scope: 'global',
  },
  {
    id: 'guardian-football',
    publisher: 'The Guardian',
    feedUrl: 'https://www.theguardian.com/football/rss',
    tier: 1,
    scope: 'global',
  },
  {
    id: 'sky-sports-football',
    publisher: 'Sky Sports',
    feedUrl: 'https://www.skysports.com/rss/12040',
    tier: 1,
    scope: 'english',
  },
  {
    id: 'espn-fc',
    publisher: 'ESPN FC',
    feedUrl: 'https://www.espn.com/espn/rss/soccer/news',
    tier: 1,
    scope: 'global',
  },
  {
    id: 'reuters-sports',
    publisher: 'Reuters',
    feedUrl: 'https://www.reutersagency.com/feed/?best-sectors=sports&post_type=best',
    tier: 1,
    scope: 'global',
  },

  // Tier 2 — football-first outlets
  {
    id: 'goal-com',
    publisher: 'Goal.com',
    feedUrl: 'https://www.goal.com/feeds/en/news',
    tier: 2,
    scope: 'global',
  },
  {
    id: '90min',
    publisher: '90min',
    feedUrl: 'https://www.90min.com/rss',
    tier: 2,
    scope: 'global',
  },
  // Removed 2026-04: onefootball (empty feed), football365 (404), the-athletic-soccer (404).
  // Verify replacement URLs before reinstating.

  // Tier 3 — specialist / analysis
  {
    id: 'football-italia',
    publisher: 'Football Italia',
    feedUrl: 'https://www.football-italia.net/rss.xml',
    tier: 3,
    scope: 'european',
  },
];

/**
 * When adding a new feed:
 * 1. Verify the RSS URL is officially published (check the site's footer or /feeds page)
 * 2. Confirm the feed terms allow summarization + linking back (standard RSS consumption is almost always fine)
 * 3. Test parsing with worker/src/testFeed.ts before adding here
 */
