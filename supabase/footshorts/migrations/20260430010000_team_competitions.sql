-- Junction table linking teams to the competitions they participate in.
-- A team can be in multiple competitions in the same season (e.g. Real Madrid:
-- La Liga + Champions League). Before this, `entities.league_slug` was the only
-- way teams were associated with a competition, which made cup competitions
-- like the UCL impossible to filter (UCL teams' league_slug points at their
-- domestic league).

create table if not exists team_competitions (
  team_id        uuid not null references entities(id) on delete cascade,
  competition_id uuid not null references entities(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (team_id, competition_id)
);

create index if not exists idx_team_competitions_competition on team_competitions (competition_id);

alter table team_competitions enable row level security;
drop policy if exists "team_competitions: public read" on team_competitions;
create policy "team_competitions: public read" on team_competitions for select using (true);

grant all on public.team_competitions to anon, authenticated, service_role;

-- Flat view used by the mobile client to answer "what teams play in
-- competition X?" in a single round-trip. security_invoker so the view
-- inherits RLS from the underlying tables.
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
  t.primary_color
from team_competitions tc
join entities t on t.id = tc.team_id
join entities c on c.id = tc.competition_id
where t.type = 'team' and c.type = 'league';

grant select on public.competition_teams to anon, authenticated, service_role;

-- Backfill: every existing team is a member of the competition matching its
-- denormalized league_slug. The seed will additionally insert UCL/EL/etc.
-- memberships on its next run.
insert into team_competitions (team_id, competition_id)
select t.id, c.id
from entities t
join entities c on c.slug = t.league_slug and c.type = 'league'
where t.type = 'team' and t.league_slug is not null
on conflict do nothing;
