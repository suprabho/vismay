/**
 * Resolve the background color for a competition/team avatar (feed story rings +
 * cards). Precedence:
 *   1. the entity's dedicated `avatar_bg_color` (set in the footshorts Asset
 *      Studio) — a value chosen JUST for the avatar disc, independent of the
 *      decorative `primary_color`,
 *   2. `primary_color` (crest-derived / editable) as a sensible default,
 *   3. the bundled competition palette (leagues) / team palette (teams),
 *   4. `undefined` — the caller keeps its neutral disc rather than a flat grey.
 *
 * Shared by the web and native feed components via both package barrels so the
 * story row and cards always agree on the color.
 */
import { resolveCompetitionColor } from './competitionMeta'
import { findTeam } from './data/teams'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function entityAvatarColor(e: {
  type: string
  slug: string
  primary_color?: string | null
  avatar_bg_color?: string | null
}): string | undefined {
  if (e.avatar_bg_color && HEX_RE.test(e.avatar_bg_color)) return e.avatar_bg_color
  if (e.primary_color && HEX_RE.test(e.primary_color)) return e.primary_color
  if (e.type === 'league') return resolveCompetitionColor(e.slug)
  if (e.type === 'team') return findTeam(e.slug)?.color
  return undefined
}
