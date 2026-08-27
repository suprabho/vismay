-- Epoch AI Frontier Data Centers — facility registry + build-out time series
-- backing the /ai-data-centers explorer and API.
--
-- Source: Epoch AI, "Frontier Data Centers Hub" (CC BY 4.0)
-- https://epoch.ai/data/ai-data-centers — refreshed ~weekly by Epoch, tracked
-- via satellite imagery, permits, and public documents.
--
-- Importer: apps/vizmaya-fyi/scripts/ai-data-centers/import-data-centers.ts,
-- run weekly by .github/workflows/import-ai-data-centers.yml (epoch.ai fronts
-- Cloudflare bot detection that 403s generic fetchers; Actions runners get
-- through with a plain fetch).

-- One row per facility. Natural key = slug (deterministic slugification of the
-- Epoch "Name" column — see the importer). lat/lng come from coordinate
-- columns in the CSV when Epoch ships them, else from the curated
-- lib/ai-data-centers/facilityCoords.ts (written on every import, same as
-- import-owid.ts + countryCentroids.ts); facilities with neither import with
-- null coords and are simply excluded from the map layer.
create table if not exists dc_facilities (
  slug             text primary key,
  name             text not null,
  owner            text,
  users            text,
  project          text,
  country          text,
  address          text,
  lat              double precision,
  lng              double precision,
  h100_equivalents double precision,   -- "Current H100 equivalents"
  power_mw         double precision,   -- "Current power (MW)"
  capex_usd_bn     double precision,   -- "Current total capital cost (2025 USD billions)"
  investors        text,
  construction_companies text,
  energy_companies text,
  notes            text,
  sources          text,               -- "Selected Sources" raw text/urls
  updated_at       timestamptz not null default now()
);

-- Long-form build-out time series, one row per (facility, metric, date) —
-- same long-not-wide shape as iea_country_energy, so adding a metric later
-- (building area, water use, …) needs no migration.
create table if not exists dc_facility_timeline (
  facility_slug    text not null references dc_facilities(slug) on delete cascade,
  metric           text not null,      -- 'power_mw' | 'h100_equivalents' | 'capex_usd_bn'
  as_of            date not null,      -- year-only source dates normalise to YYYY-01-01
  value            double precision not null,
  primary key (facility_slug, metric, as_of)
);

create index if not exists idx_dc_timeline_facility_metric
  on dc_facility_timeline(facility_slug, metric, as_of);

alter table dc_facilities        enable row level security;
alter table dc_facility_timeline enable row level security;

create policy "Public read dc_facilities"
  on dc_facilities for select
  using (true);

create policy "Public read dc_facility_timeline"
  on dc_facility_timeline for select
  using (true);

-- Seed the epic row as draft + hidden until the landing page ships, then flip
-- status='published' / show_on_home=true (same rollout as coke-studio).
insert into epics (slug, name, description, landing_component, status, app_slug, show_on_home)
  values (
    'ai-data-centers',
    'AI Data Centers',
    'Tracking the build-out of frontier AI data centers — power, compute, and capital, from satellite imagery and permits.',
    'AiDataCentersLanding',
    'draft',
    'vizmaya-fyi',
    false
  )
  on conflict (slug) do update set
    name              = excluded.name,
    description       = excluded.description,
    landing_component = excluded.landing_component;
