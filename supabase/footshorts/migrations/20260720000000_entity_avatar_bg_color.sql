-- Dedicated avatar background color for feed story-rings + cards, INDEPENDENT of
-- primary_color (which drives card glow, borders and match-tile gradients). Set
-- in the footshorts Asset Studio. Stored as a 7-char hex, e.g. "#EF0107".
-- When null, the avatar falls back to primary_color, then the bundled palette.
alter table entities
  add column if not exists avatar_bg_color text;

-- Recreate the competition_teams view to expose avatar_bg_color (views don't pick
-- up new base-table columns automatically). Kept in sync with the definition in
-- 20260615000000_entity_popularity.sql.
create or replace view competition_teams with (security_invoker = true) as
select
  c.slug         as competition_slug,
  t.id,
  t.type,
  t.slug,
  t.name,
  t.country,
  t.league_slug,
  t.team_slug,
  t.crest_url,
  t.primary_color,
  t.popularity,
  t.avatar_bg_color
from team_competitions tc
join entities t on t.id = tc.team_id
join entities c on c.id = tc.competition_id
where t.type = 'team' and c.type = 'league';
