/**
 * theanalyst.com competition/season identity, keyed by our competition_slug
 * (fixtures.competition_slug / entities slug).
 *
 * theanalyst has no discoverable API for these — its match centre addresses
 * everything by opaque string ids in the URL — so this is a manually curated
 * static map, the same role entities.football_data_id plays for
 * football-data.org. Season ids change every season: refresh the seasonId
 * entries at the start of each season (docs/theanalyst-scraping.md).
 *
 * To find ids: open https://theanalyst.com/opta-football-match-centre in a
 * browser, navigate to a match in the competition, and copy competitionId /
 * seasonId from the address bar.
 */

export type TheanalystCompetition = {
  competitionSlug: string;
  theanalystCompetitionId: string;
  theanalystSeasonId: string;
};

export const THEANALYST_COMPETITIONS: TheanalystCompetition[] = [
  {
    // Ids taken from the feature request's example match-centre URL.
    // TODO(verify): confirm this pair is the Premier League's CURRENT season
    // before enabling the cron — see docs/theanalyst-scraping.md.
    competitionSlug: 'premier-league',
    theanalystCompetitionId: '34pl8szyvrbwcmfkuocjm3r6t',
    theanalystSeasonId: '830epggffy1nfkfyrtpqdwhlg',
  },
  // TODO(verify): populate the other tracked competitions (champions-league,
  // primera-division, serie-a, bundesliga, ligue-1, …) with real ids.
];
