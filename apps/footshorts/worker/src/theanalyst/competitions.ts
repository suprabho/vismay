/**
 * theanalyst.com competition identity, keyed by our competition_slug
 * (fixtures.competition_slug / entities slug).
 *
 * Only a human-readable URL slug is curated here — the opaque
 * competitionId/seasonId pair the match centre actually addresses matches by
 * is read live off theanalyst's own fixtures-listing page during discovery
 * (matchDiscovery.ts), not hand-maintained. That replaced an earlier version
 * of this file that DID hand-curate competitionId/seasonId (guessed from a
 * single example URL, never verified) — season ids change every season and
 * there was no way to notice a stale one short of the cron silently
 * discovering zero matches. Reading them fresh off the live page removes
 * that whole maintenance burden.
 *
 * theanalystSlug values verified live 2026-08-24 (Championship: 2026-09-09) by requesting
 * `https://theanalyst.com/competition/<slug>/fixtures` and checking the
 * page title. Note it doesn't always match our own slug (`la-liga` vs our
 * `primera-division`), and `champions-league` 301-redirects to
 * `uefa-champions-league`.
 */

export type TheanalystCompetition = {
  competitionSlug: string;
  /** theanalyst.com's own URL slug: `/competition/<theanalystSlug>/fixtures`. */
  theanalystSlug: string;
};

export const THEANALYST_COMPETITIONS: TheanalystCompetition[] = [
  { competitionSlug: 'premier-league', theanalystSlug: 'premier-league' },
  { competitionSlug: 'primera-division', theanalystSlug: 'la-liga' },
  { competitionSlug: 'serie-a', theanalystSlug: 'serie-a' },
  { competitionSlug: 'bundesliga', theanalystSlug: 'bundesliga' },
  { competitionSlug: 'ligue-1', theanalystSlug: 'ligue-1' },
  { competitionSlug: 'champions-league', theanalystSlug: 'uefa-champions-league' },
  // Verified live 2026-09-09: `/competition/championship` 301s here. Of the
  // other football-data leagues we ingest, theanalyst covers none of
  // eredivisie / primeira-liga / campeonato-brasileiro-serie-a (all 404) —
  // its football nav is PL, Championship, League One/Two, La Liga, Serie A,
  // Bundesliga, Ligue 1, UCL/UEL/UECL, Scottish Premiership, MLS, Saudi
  // Pro League, WSL.
  { competitionSlug: 'championship', theanalystSlug: 'english-championship' },
];
