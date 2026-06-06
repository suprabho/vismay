-- FIFA World Cup 2026 epic. 48 qualified teams + country metrics from
-- vizmaya-data/FIFA/wc2026_master.xlsx. Map-first landing at /fifa-wc26
-- mirrors the /energy-profile pattern (lib/epics.ts, migrations 015 + 018).
--
-- One row per team. Metric columns mirror the source 1:1 in snake_case so the
-- importer (scripts/fifa-wc26/import.ts) maps cell→column directly. Per-metric
-- columns (not jsonb) because the UI needs to sort / filter / color-by them.
--
-- code: FIFA 3-letter team codes (USA, ENG, SCO, NED, GER, POR, KOR, CUW,
-- CPV, …). Alpha-3 where applicable with the standard FIFA exceptions.

create table if not exists fifa_wc26_teams (
  code                     text primary key,
  name                     text not null,
  confederation            text not null
    check (confederation in ('UEFA','CONMEBOL','CAF','AFC','CONCACAF','OFC')),
  qualification            text not null,
  is_host                  boolean not null default false,
  is_debut                 boolean not null default false,
  lat                      double precision not null,
  lng                      double precision not null,
  squad_value_eur_mn       integer,
  gdp_nominal_usd_bn       double precision,
  gdp_per_capita_ppp_usd   integer,
  population_mn            double precision,
  land_area_sq_km          integer,
  gini_index               double precision,
  eiu_democracy_index_2024 double precision,
  regime_type              text,
  updated_at               timestamptz not null default now()
);

create unique index if not exists idx_fifa_wc26_teams_name
  on fifa_wc26_teams(name);
create index if not exists idx_fifa_wc26_teams_confederation
  on fifa_wc26_teams(confederation);

alter table fifa_wc26_teams enable row level security;

create policy "Public read fifa_wc26_teams"
  on fifa_wc26_teams for select
  using (true);

insert into epics (slug, name, description, landing_component)
values (
  'fifa-wc26',
  'FIFA World Cup 2026',
  'The 48 nations at the 2026 World Cup — by squad value, economy, and democracy.',
  'fifa-wc26-map'
)
on conflict (slug) do nothing;
