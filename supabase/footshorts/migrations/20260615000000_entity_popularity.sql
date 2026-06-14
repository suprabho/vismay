-- Curated popularity used to rank teams within a league during onboarding.
-- Higher = more prominent; 0 (default) = unranked and sorts after curated teams,
-- falling back to alphabetical. The teams onboarding screen shows only the top 5
-- per league by this value, so editors get full control over which clubs surface.

alter table entities
  add column if not exists popularity int not null default 0;

-- Recreate the competition_teams view to expose popularity. (Views don't pick up
-- new base-table columns automatically.) Kept in sync with the definition in
-- 20260430010000_team_competitions.sql.
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
  t.popularity
from team_competitions tc
join entities t on t.id = tc.team_id
join entities c on c.id = tc.competition_id
where t.type = 'team' and c.type = 'league';

-- Initial curated ranking for marquee clubs across the major leagues. Slugs are
-- the canonical entity slugs produced by the seed's commonName(). Editors should
-- extend this list; teams left at 0 fall back to alphabetical order.
update entities set popularity = v.pop from (values
  -- Premier League
  ('manchester-city', 100),
  ('arsenal', 95),
  ('liverpool', 90),
  ('manchester-united', 85),
  ('chelsea', 80),
  ('tottenham-hotspur', 75),
  ('newcastle-united', 70),
  -- La Liga (primera-division)
  ('real-madrid', 100),
  ('barcelona', 95),
  ('club-atletico-de-madrid', 90),
  ('sevilla', 80),
  ('real-betis-balompie', 75),
  ('valencia', 70),
  ('villarreal', 65),
  -- Bundesliga
  ('bayern-munchen', 100),
  ('borussia-dortmund', 95),
  -- Serie A
  ('internazionale-milano', 100),
  ('juventus', 95),
  ('milan', 90),
  ('napoli', 85),
  ('roma', 80),
  ('lazio', 75),
  ('atalanta', 70),
  -- Ligue 1
  ('paris-saint-germain', 100),
  ('olympique-de-marseille', 90),
  ('olympique-lyonnais', 85),
  ('monaco', 80),
  ('lille', 75)
) as v(slug, pop)
where entities.type = 'team' and entities.slug = v.slug;
