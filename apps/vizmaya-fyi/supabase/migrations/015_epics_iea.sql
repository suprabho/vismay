-- Epics: topic collections (IEA, Epstein, …) that surface a bespoke landing
-- page plus a curated set of vizmaya stories. The landing page is hand-built
-- per epic (the `landing_component` discriminator picks the React component);
-- the data model is shared.
--
-- IEA-specific tables (iea_news, iea_countries) live here too so the whole
-- subsection comes up in one migration. Other epics can add their own tables
-- alongside without touching this one.

create table if not exists epics (
  slug              text primary key,
  name              text not null,
  description       text,
  landing_component text not null,
  status            text not null default 'published'
                    check (status in ('draft', 'published', 'archived')),
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

alter table epics enable row level security;

create policy "Public read published epics"
  on epics for select
  using (status = 'published');

-- Many-to-many between stories and epics. A story can belong to multiple
-- epics; an epic surfaces many stories. `position` lets the epic landing
-- page order them deliberately.
create table if not exists story_epics (
  story_slug  text not null references stories(slug) on delete cascade,
  epic_slug   text not null references epics(slug) on delete cascade,
  position    int,
  created_at  timestamptz not null default now(),
  primary key (story_slug, epic_slug)
);

create index if not exists idx_story_epics_epic on story_epics(epic_slug);

alter table story_epics enable row level security;

create policy "Public read story_epics"
  on story_epics for select
  using (true);

-- One row per IEA news article. The scraper (next phase) upserts on
-- source_url. country_codes is ISO 3166-1 alpha-2 so the landing-page map
-- can aggregate by country without re-parsing the title.
create table if not exists iea_news (
  id              bigint generated always as identity primary key,
  source_url      text not null unique,
  title           text not null,
  summary         text,
  published_at    timestamptz not null,
  country_codes   text[] not null default '{}',
  topics          text[] not null default '{}',
  raw             jsonb,
  fetched_at      timestamptz not null default now()
);

create index if not exists idx_iea_news_published on iea_news(published_at desc);
create index if not exists idx_iea_news_country   on iea_news using gin (country_codes);

alter table iea_news enable row level security;

create policy "Public read iea_news"
  on iea_news for select
  using (true);

-- Per-country energy profile scraped from iea.org/countries/<slug>. lat/lng
-- is the country centroid used for placing the map pin. `summary` and
-- `energy_mix` are LLM-derived from the source page; refreshed quarterly.
create table if not exists iea_countries (
  code         text primary key,
  name         text not null,
  lat          double precision not null,
  lng          double precision not null,
  summary      text,
  energy_mix   jsonb,
  source_url   text,
  updated_at   timestamptz not null default now()
);

alter table iea_countries enable row level security;

create policy "Public read iea_countries"
  on iea_countries for select
  using (true);

-- Seed the IEA epic so /iea renders out of the box.
insert into epics (slug, name, description, landing_component)
  values (
    'iea',
    'IEA',
    'Live energy news, country profiles, and vizmaya stories on the global energy transition.',
    'iea-map'
  )
  on conflict (slug) do nothing;

-- Seed a starter set of country centroids so the map has pins before the
-- scraper exists. The scraper will upsert real summaries / energy mix later.
insert into iea_countries (code, name, lat, lng, summary) values
  ('US', 'United States', 39.8,  -98.5, 'Largest oil & gas producer; rapid renewables build-out alongside record LNG exports.'),
  ('CN', 'China',          35.0,  104.0, 'World''s largest energy consumer; dominates solar manufacturing and EV deployment.'),
  ('IN', 'India',           20.6,   78.9, 'Third-largest emitter; coal-heavy grid undergoing record solar additions.'),
  ('RU', 'Russia',          61.5,  105.3, 'Major oil & gas exporter rerouting flows from Europe to Asia post-2022.'),
  ('SA', 'Saudi Arabia',    23.9,   45.1, 'OPEC+ swing producer balancing domestic Vision 2030 against export revenue.'),
  ('DE', 'Germany',         51.2,   10.4, 'Phasing out coal and nuclear; LNG terminals replaced Russian pipeline gas.'),
  ('GB', 'United Kingdom',  55.4,   -3.4, 'North Sea wind leader; gas-dependent power mix in a tight capacity market.'),
  ('FR', 'France',          46.6,    1.9, 'Nuclear-heavy grid restarting fleet availability after 2022 outages.'),
  ('JP', 'Japan',           36.2,  138.3, 'LNG and coal importer slowly restarting nuclear; major hydrogen push.'),
  ('AU', 'Australia',      -25.3,  133.8, 'Top LNG and coal exporter; aggressive domestic renewables target.'),
  ('BR', 'Brazil',         -14.2,  -51.9, 'Hydro-dominant grid expanding wind in the northeast; ethanol leader.'),
  ('ZA', 'South Africa',   -30.6,   22.9, 'Eskom load-shedding crisis driving rapid private solar and storage build.')
  on conflict (code) do nothing;

-- Mock recent news so the "last 7 days" map has signal before the scraper
-- runs. Safe to wipe once the real pipeline lands.
insert into iea_news (source_url, title, summary, published_at, country_codes, topics) values
  ('https://www.iea.org/news/mock-1', 'China solar additions hit new monthly record',
   'Installed PV capacity in China grew faster in Q2 than the IEA''s 2030 baseline forecast.',
   now() - interval '1 day', array['CN'], array['solar', 'renewables']),
  ('https://www.iea.org/news/mock-2', 'US LNG exports rebound after Freeport restart',
   'Liquefaction utilisation rates returned to 2022 highs as Gulf Coast terminals cleared maintenance.',
   now() - interval '2 days', array['US'], array['lng', 'gas']),
  ('https://www.iea.org/news/mock-3', 'India coal-fired generation rises despite renewables surge',
   'Peak demand growth outran new clean capacity, pushing coal load factors up 4 percentage points YoY.',
   now() - interval '3 days', array['IN'], array['coal', 'electricity']),
  ('https://www.iea.org/news/mock-4', 'Germany finalises last coal plant retirements ahead of 2030',
   'Closure schedule accelerated as renewables capacity factor outpaced grid build-out.',
   now() - interval '4 days', array['DE'], array['coal', 'transition']),
  ('https://www.iea.org/news/mock-5', 'Saudi Arabia reaffirms voluntary output cuts',
   'OPEC+ communique extends 1 mb/d Saudi curtailment through year-end.',
   now() - interval '5 days', array['SA'], array['oil', 'opec']),
  ('https://www.iea.org/news/mock-6', 'France nuclear availability tops 75% for first time since 2019',
   'Stress-corrosion repairs across the EDF fleet near completion ahead of winter.',
   now() - interval '6 days', array['FR'], array['nuclear']),
  ('https://www.iea.org/news/mock-7', 'Australia greenlights large-scale battery on retired coal site',
   'Eraring substation conversion to host one of the world''s largest co-located storage projects.',
   now() - interval '2 days', array['AU'], array['storage', 'renewables']),
  ('https://www.iea.org/news/mock-8', 'South Africa private solar imports cross 5 GW',
   'Customs data shows household and commercial PV avoided the worst of the year''s load-shedding.',
   now() - interval '1 day', array['ZA'], array['solar', 'grid'])
  on conflict (source_url) do nothing;
