-- Repair entities.league_slug for teams incorrectly tagged with a continental
-- club competition (UEFA Champions League, UEFA Europa League) or an
-- international national-team competition (FIFA World Cup, European
-- Championship) instead of their domestic league.
--
-- Root cause: seed.ts iterates every competition and sets league_slug on each
-- pass; the Map-based dedupe keeps whichever pass ran last, so a team in both
-- La Liga and the Champions League could end up with league_slug =
-- 'champions-league'. team_competitions captures all memberships correctly, so
-- we use it to recover the domestic league.
--
-- Surfaced by the WC26 squad treemap grouping players under "Champions League"
-- instead of their actual national league.

with domestic_for_team as (
  select distinct on (tc.team_id)
    tc.team_id,
    l.slug
  from team_competitions tc
  join entities l on l.id = tc.competition_id
  where l.type = 'league'
    and l.slug not in (
      'champions-league',
      'europa-league',
      'fifa-world-cup',
      'european-championship'
    )
  order by tc.team_id, l.slug
)
update entities t
set league_slug = d.slug
from domestic_for_team d
where t.id = d.team_id
  and t.type = 'team'
  and t.league_slug in (
    'champions-league',
    'europa-league',
    'fifa-world-cup',
    'european-championship'
  );

-- For teams whose only competition membership was a continental/international
-- comp (no domestic league in the seed), null out the incorrect league_slug
-- rather than leaving the misleading tag.
update entities
set league_slug = null
where type = 'team'
  and league_slug in (
    'champions-league',
    'europa-league',
    'fifa-world-cup',
    'european-championship'
  );
