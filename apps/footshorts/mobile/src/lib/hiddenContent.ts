/**
 * Client-side content gate for App Store Guideline 5.2.1 (third-party IP).
 *
 * Apple flagged the app for FIFA-branded content ("FIFA World Cup 2026"),
 * which we don't hold a license for. Until that's resolved, the mobile binary
 * hides the World Cup competition and the FIFA-branded editorial epic
 * entirely. This is a mobile-only gate: server data, the web app, and the
 * admin are untouched, so flipping the feature back on is deleting slugs from
 * these sets.
 *
 * Every mobile data hook that can surface competition-scoped content filters
 * through here — league lists, fixtures, follows, feed entity chips, and the
 * editorial magazine.
 */

/** Competition slugs (fixtures.competition_slug / entities.slug) to hide. */
export const HIDDEN_COMPETITION_SLUGS: ReadonlySet<string> = new Set(['world-cup'])

/** Editorial epic slugs to hide from the magazine + epic reader. */
export const HIDDEN_EPIC_SLUGS: ReadonlySet<string> = new Set(['fifa-wc26'])

/** Editorial story slugs to hide from the magazine + story reader. */
export const HIDDEN_STORY_SLUGS: ReadonlySet<string> = new Set(['world-cup-2026-atlas'])

export function isHiddenCompetition(slug: string | null | undefined): boolean {
  return !!slug && HIDDEN_COMPETITION_SLUGS.has(slug)
}

/** True for entities (league type) whose slug is a hidden competition. */
export function isHiddenEntity(
  entity: { type?: string | null; slug?: string | null } | null | undefined,
): boolean {
  return entity?.type === 'league' && isHiddenCompetition(entity.slug)
}

/** Drop fixtures belonging to hidden competitions. */
export function filterHiddenFixtures<T extends { competition_slug: string | null }>(
  rows: T[],
): T[] {
  return rows.filter((r) => !isHiddenCompetition(r.competition_slug))
}

/**
 * PostgREST `in`-list of hidden competition slugs, for server-side exclusion
 * via `.not('competition_slug', 'in', hiddenCompetitionInList())` — keeps
 * `limit`-ed queries returning full pages instead of post-filtered ones.
 */
export function hiddenCompetitionInList(): string {
  return `(${[...HIDDEN_COMPETITION_SLUGS].join(',')})`
}
