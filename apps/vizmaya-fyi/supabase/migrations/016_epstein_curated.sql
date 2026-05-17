-- Curated Epstein network data imported from
--   https://github.com/dleerdefi/epstein-network-data (v2.0, 2025-11-16, MIT)
--
-- These tables are hand-curated and citation-tracked, distinct from the
-- LLM-extracted `epstein_locations` / `epstein_people` / `epstein_events`
-- tables produced by the NER pipeline (migration 002). Name choice:
-- `epstein_persons` (this file) ≠ `epstein_people` (migration 002).
--
-- Loader: `scripts/epstein/import-curated.ts`

-- ---------------------------------------------------------------------------
-- Nodes
-- ---------------------------------------------------------------------------

create table if not exists epstein_persons (
  entity_id     text primary key,            -- "person_001" etc. (stable upstream IDs)
  name          text not null,
  aliases       text[]      not null default '{}',
  birth_year    int,
  death_year    int,
  nationality   text,
  occupations   text[]      not null default '{}',
  summary       text,
  sources       text[]      not null default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists idx_epstein_persons_name on epstein_persons using gin (to_tsvector('simple', name));

-- Recommended addition (so WORKED_FOR / DIRECTOR_OF / CEO_OF etc. don't dangle).
-- Drop this and its FK references in `epstein_relationships` if you'd rather keep scope tight.
create table if not exists epstein_organizations (
  entity_id     text primary key,            -- "org_001" etc.
  name          text not null,
  founded       int,
  location      text,
  note          text,
  sources       text[]      not null default '{}',
  created_at    timestamptz not null default now()
);

create table if not exists epstein_citations (
  citation_id      text primary key,         -- "cite_002" etc.
  citation_number  int,
  title            text,
  url              text,
  source_type      text,                     -- 'Wikipedia', 'Web Source', etc.
  reliability_score real,
  times_referenced int  not null default 0,
  created_at       timestamptz not null default now()
);

-- Recommended addition. CLAIM_ABOUT / SUPPORTED_BY edges target these.
create table if not exists epstein_claims (
  claim_id            text primary key,      -- "claim_1_1_1" etc.
  claim_number        text,                  -- "1.1.1"
  text                text not null,
  verification_status text,                  -- 'Factual', 'Unverified', etc.
  section             text,
  subsection          text,
  confidence          real,
  analysis            text,
  citations           text[] not null default '{}',  -- citation numbers as strings, joined later
  entities            text[] not null default '{}',  -- entity_ids referenced
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Polymorphic relationship edge (covers all 65 relation types in one table)
-- ---------------------------------------------------------------------------
-- start_id / end_id reference persons | organizations | claims | citations.
-- We don't enforce FKs because the type varies per row — the loader validates
-- on import and the query layer joins by prefix (`person_*`, `org_*`, …).

create table if not exists epstein_relationships (
  id                   bigserial primary key,
  rel_type             text not null,        -- 'WORKED_FOR', 'ABUSED', 'CLAIM_ABOUT', …
  start_id             text not null,
  end_id               text not null,
  context              text,
  confidence           real,
  citations            text[] not null default '{}',
  verification_status  text,
  circled              boolean,
  section              text,                 -- only set for CLAIM_ABOUT
  created_at           timestamptz not null default now(),
  unique (rel_type, start_id, end_id)
);
create index if not exists idx_epstein_rel_type   on epstein_relationships (rel_type);
create index if not exists idx_epstein_rel_start  on epstein_relationships (start_id);
create index if not exists idx_epstein_rel_end    on epstein_relationships (end_id);

-- ---------------------------------------------------------------------------
-- Airports (geocoded, 283 rows)
-- ---------------------------------------------------------------------------

create table if not exists epstein_airports (
  iata          text primary key,            -- 3-letter code, e.g. 'PBI'
  icao          text,                        -- 4-letter, e.g. 'KPBI'
  full_name     text,
  lat           double precision not null,
  lng           double precision not null,
  city          text,
  state         text,
  country       text,
  elevation_ft  int,
  airport_type  text,                        -- 'large_airport' | 'medium_airport' | …
  data_source   text,                        -- 'ourairports' | 'google_maps_api' | 'manual_geocoding'
  geocoded_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Flights (currently pages 1–31 of the flight logs, 1991–1994, ~559 rows)
-- ---------------------------------------------------------------------------

create table if not exists epstein_flights (
  id                  bigserial primary key,
  source_page         int not null,          -- which flight log page produced this row
  page_index          int not null,          -- ordinal within page
  flight_date         date,                  -- parsed (may be null if extraction was uncertain)
  flight_date_raw     text,                  -- the original display string, e.g. "04/25/1991"
  aircraft_make_model text,
  aircraft_tail       text,
  from_codes          text[] not null default '{}',  -- ['PSP','CLE']
  to_codes            text[] not null default '{}',  -- ['CMH']
  miles_flown         int,
  flight_number       text,
  remarks             text,
  landings            int,
  raw                 jsonb,                 -- preserve full per-flight JSON for fields we didn't promote
  created_at          timestamptz not null default now(),
  unique (source_page, page_index)
);
create index if not exists idx_epstein_flights_date  on epstein_flights (flight_date);
create index if not exists idx_epstein_flights_tail  on epstein_flights (aircraft_tail);
create index if not exists idx_epstein_flights_from  on epstein_flights using gin (from_codes);
create index if not exists idx_epstein_flights_to    on epstein_flights using gin (to_codes);

create table if not exists epstein_flight_passengers (
  id           bigserial primary key,
  flight_id    bigint not null references epstein_flights(id) on delete cascade,
  raw_name     text not null,                -- as written in the log, e.g. "Mr. Martino"
  person_entity_id text,                     -- best-effort match to epstein_persons.entity_id (nullable)
  passenger_code text,                       -- log code if any
  passenger_type text,                       -- 'identified' | 'unidentified' | …
  notable      boolean,
  confidence   text,                         -- 'high' | 'medium' | 'low' (from source JSON)
  created_at   timestamptz not null default now()
);
create index if not exists idx_epstein_passengers_flight  on epstein_flight_passengers (flight_id);
create index if not exists idx_epstein_passengers_person  on epstein_flight_passengers (person_entity_id);
create index if not exists idx_epstein_passengers_name    on epstein_flight_passengers using gin (to_tsvector('simple', raw_name));

-- ---------------------------------------------------------------------------
-- Black Book (~2,327 contacts; addresses + phones geocoded separately upstream)
-- ---------------------------------------------------------------------------

create table if not exists epstein_blackbook (
  id              bigserial primary key,
  page            int,
  page_link       text,                      -- archive.org URL of source scan
  name            text,
  surname         text,
  first_name      text,
  company         text,
  address_type    text,
  address         text,
  zip             text,
  city            text,
  country         text,
  phone_generic   text,                      -- "Phone (no specifics)"
  phone_work      text,
  phone_home      text,
  phone_mobile    text,
  email           text,
  -- Geocoded coordinates (joined in by loader from
  --   geocoded/addresses_neo4j_*.json and geocoded/phone_locations_cache.json).
  -- Picks address-derived coords first, falls back to phone-derived.
  lat             double precision,
  lng             double precision,
  geocoded_source text,                      -- 'address' | 'phone' | null
  created_at      timestamptz not null default now()
);
create index if not exists idx_epstein_blackbook_country on epstein_blackbook (country);
create index if not exists idx_epstein_blackbook_geo on epstein_blackbook (lat, lng) where lat is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Data is sourced from a public MIT-licensed dataset and served by the public
-- /epstein viz, so all tables get public read. Writes happen only from the
-- loader script using the service role key, which bypasses RLS.

alter table epstein_persons             enable row level security;
alter table epstein_organizations       enable row level security;
alter table epstein_citations           enable row level security;
alter table epstein_claims              enable row level security;
alter table epstein_relationships       enable row level security;
alter table epstein_airports            enable row level security;
alter table epstein_flights             enable row level security;
alter table epstein_flight_passengers   enable row level security;
alter table epstein_blackbook           enable row level security;

create policy "Public read epstein_persons"           on epstein_persons           for select using (true);
create policy "Public read epstein_organizations"     on epstein_organizations     for select using (true);
create policy "Public read epstein_citations"         on epstein_citations         for select using (true);
create policy "Public read epstein_claims"            on epstein_claims            for select using (true);
create policy "Public read epstein_relationships"     on epstein_relationships     for select using (true);
create policy "Public read epstein_airports"          on epstein_airports          for select using (true);
create policy "Public read epstein_flights"           on epstein_flights           for select using (true);
create policy "Public read epstein_flight_passengers" on epstein_flight_passengers for select using (true);
create policy "Public read epstein_blackbook"         on epstein_blackbook         for select using (true);
