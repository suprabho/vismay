-- Per-country energy timeseries for the /iea country detail sheet. One row per
-- (country, indicator, year) so we can fan out 9-series stacked-area charts
-- (electricity mix, primary energy mix), single-series line charts (CO2,
-- renewables share) and a handful of headline stat tiles from one query.
--
-- Source: Our World in Data's owid-energy-data.csv (CC BY 4.0). Loaded by
-- scripts/iea/import-owid.ts; refreshed manually (OWID publishes annually
-- each April).
--
-- The set of indicator keys is fixed by the importer — see that script for
-- the OWID column → indicator mapping. Storing as a long table (rather than
-- a wide JSONB column) makes it easy to add indicators later without a
-- migration and keeps the per-country payload trivially queryable.

create table if not exists iea_country_energy (
  country_code text not null references iea_countries(code) on delete cascade,
  indicator    text not null,
  year         smallint not null,
  value        double precision,
  primary key (country_code, indicator, year)
);

create index if not exists idx_iea_country_energy_indicator
  on iea_country_energy(country_code, indicator);

alter table iea_country_energy enable row level security;

create policy "Public read iea_country_energy"
  on iea_country_energy for select
  using (true);
