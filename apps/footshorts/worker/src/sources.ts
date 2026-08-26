/**
 * News source registry.
 * Each RSS source must be an RSS/Atom feed explicitly published by the outlet
 * for syndication — NOT a scraped page. This gives us clean commercial terms.
 *
 * One approved exception: theanalyst.com (SCRAPE_SOURCES below) is scraped —
 * it publishes no feed — with the same mitigations RSS gets (always attribute
 * and link back, summarize only, never reproduce full text). Rationale,
 * politeness rules and the pre-launch verification checklist live in
 * docs/theanalyst-scraping.md. Don't add scraped sources beyond that doc's terms.
 *
 * Verify each feed before launch (URLs can change).
 * Tier 1 = wire/reputable, Tier 2 = fan sites / club official, Tier 3 = specialist
 */

export type RssSource = {
  id: string;              // stable slug
  publisher: string;       // display name
  feedUrl: string;
  tier: 1 | 2 | 3;
  scope: 'global' | 'english' | 'european' | 'spanish' | 'latam' | 'club';
  clubSlug?: string;       // for club-specific feeds
  /**
   * ISO 639-1 language the feed publishes in. Omit for English.
   * Non-English items are translated to English at the summarization step
   * (see gemini.ts): the summary is always written in English and the stored
   * headline is replaced with Gemini's English translation.
   */
  language?: 'es';
  /** ISO 3166-1 alpha-2 country of the outlet, for non-English sources. */
  country?: string;
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
  // Removed 2026-05: reuters-sports (reutersagency.com /feed now 404; www.reuters.com returns 401 — no public RSS).

  // Tier 2 — football-first outlets
  {
    id: '90min',
    publisher: '90min',
    feedUrl: 'https://www.90min.com/feed',
    tier: 2,
    scope: 'global',
  },
  // Removed 2026-04: onefootball (empty feed), football365 (404), the-athletic-soccer (404).
  // Removed 2026-05: goal-com (every common feed path returns 404 — RSS retired).
  // Verify replacement URLs before reinstating.

  // Tier 3 — specialist / analysis
  {
    id: 'football-italia',
    publisher: 'Football Italia',
    feedUrl: 'https://www.football-italia.net/rss.xml',
    tier: 3,
    scope: 'european',
  },

  // ---------------------------------------------------------------
  // Spanish-language outlets (added 2026-08). All publish official RSS.
  // Items arrive in Spanish; gemini.ts translates headline + summary
  // to English during summarization.
  // TODO(verify): these feed URLs could not be probed from the sandbox
  // they were added in (network egress blocked) — hit each once before
  // the next production ingest run, per the checklist below.
  // ---------------------------------------------------------------

  // Marca (Spain) — per-section feeds
  {
    id: 'marca-laliga',
    publisher: 'Marca',
    feedUrl: 'https://e00-marca.uecdn.es/rss/futbol/primera-division.xml',
    tier: 1,
    scope: 'spanish',
    language: 'es',
    country: 'ES',
  },
  {
    id: 'marca-real-madrid',
    publisher: 'Marca',
    feedUrl: 'https://e00-marca.uecdn.es/rss/futbol/real-madrid.xml',
    tier: 1,
    scope: 'club',
    clubSlug: 'real-madrid',
    language: 'es',
    country: 'ES',
  },
  {
    id: 'marca-barcelona',
    publisher: 'Marca',
    feedUrl: 'https://e00-marca.uecdn.es/rss/futbol/barcelona.xml',
    tier: 1,
    scope: 'club',
    clubSlug: 'barcelona',
    language: 'es',
    country: 'ES',
  },
  {
    id: 'marca-fichajes',
    publisher: 'Marca',
    feedUrl: 'https://e00-marca.uecdn.es/rss/futbol/fichajes.xml',
    tier: 1,
    scope: 'global', // transfer market coverage spans leagues
    language: 'es',
    country: 'ES',
  },
  {
    id: 'marca-internacional',
    publisher: 'Marca',
    feedUrl: 'https://e00-marca.uecdn.es/rss/futbol/futbol-internacional.xml',
    tier: 1,
    scope: 'global',
    language: 'es',
    country: 'ES',
  },
  {
    id: 'as-futbol',
    publisher: 'Diario AS',
    feedUrl: 'https://feeds.as.com/mrss-s/pages/as/site/as.com/section/futbol/portada/',
    tier: 1,
    scope: 'spanish',
    language: 'es',
    country: 'ES',
  },
  {
    id: 'md-futbol',
    publisher: 'Mundo Deportivo',
    feedUrl: 'https://www.mundodeportivo.com/feed/rss/futbol',
    tier: 1,
    scope: 'spanish',
    language: 'es',
    country: 'ES',
  },
  {
    id: 'sport-es',
    publisher: 'SPORT',
    // Last-news feed covers all sections; the football-only classifier hides
    // the non-football remainder.
    feedUrl: 'https://www.sport.es/es/rss/last-news/news.xml',
    tier: 1,
    scope: 'spanish',
    language: 'es',
    country: 'ES',
  },

  // Latin America
  {
    id: 'infobae-deportes',
    publisher: 'Infobae',
    // Site-wide outbound feed (no sports-only RSS published); non-football
    // items are hidden by the classifier.
    feedUrl: 'https://www.infobae.com/arc/outboundfeeds/rss/?outputType=xml',
    tier: 1,
    scope: 'latam',
    language: 'es',
    country: 'AR',
  },
  {
    id: 'eltiempo-futbol-col',
    publisher: 'El Tiempo',
    feedUrl: 'https://www.eltiempo.com/rss/deportes_futbol-colombiano.xml',
    tier: 1,
    scope: 'latam',
    language: 'es',
    country: 'CO',
  },
  {
    id: 'eltiempo-futbol-int',
    publisher: 'El Tiempo',
    feedUrl: 'https://www.eltiempo.com/rss/deportes_futbol-internacional.xml',
    tier: 1,
    scope: 'global',
    language: 'es',
    country: 'CO',
  },
  {
    id: 'perfil-deportes',
    publisher: 'Perfil',
    feedUrl: 'https://www.perfil.com/feed/deportes',
    tier: 2,
    scope: 'latam',
    language: 'es',
    country: 'AR',
  },
];

/**
 * Scraped sources — the approved exception to the RSS-only policy above.
 * ingest.ts fetches listingUrl, extracts article links via the matching
 * adapter in src/theanalyst/, then runs each article through the same
 * dedupe → summarize → entity-tag pipeline as RSS items.
 */
export type ScrapeSource = {
  id: string;              // stable slug; also selects the scraper adapter
  publisher: string;       // display name (attribution in the feed)
  listingUrl: string;      // index page article links are collected from
  tier: 1 | 2 | 3;
  scope: 'global' | 'english' | 'european' | 'club';
};

export const SCRAPE_SOURCES: ScrapeSource[] = [
  {
    id: 'theanalyst',
    publisher: 'The Analyst (Opta)',
    // TODO(verify): confirm the football listing path against the live site
    // before enabling in production — see docs/theanalyst-scraping.md.
    listingUrl: 'https://theanalyst.com/competition/premier-league',
    tier: 1,
    scope: 'global',
  },
];

/**
 * When adding a new feed:
 * 1. Verify the RSS URL is officially published (check the site's footer or /feeds page)
 * 2. Confirm the feed terms allow summarization + linking back (standard RSS consumption is almost always fine)
 * 3. Test parsing with worker/src/testFeed.ts before adding here
 */
