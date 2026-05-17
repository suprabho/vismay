-- ShortFoot: knockout-stage support for fixtures
-- football-data.org returns `stage` for cup/knockout matches (e.g. LAST_16,
-- QUARTER_FINALS, SEMI_FINALS, FINAL). League rounds are matchday-numbered;
-- knockouts have no matchday and need stage to group/label them in the UI.

alter table fixtures
  add column if not exists stage text;

create index if not exists idx_fixtures_competition_stage
  on fixtures (competition_slug, stage)
  where stage is not null;
