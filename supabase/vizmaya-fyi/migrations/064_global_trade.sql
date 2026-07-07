-- Global Trade epic: world/country exports by product/year, plus country and
-- HS-product dimension tables. Long format mirrors 018_iea_country_energy.sql
-- so new slices need no migration.
--
-- Sources (see vizmaya-data/global-trade/INGEST_NOTES.md for provenance):
--   * OEC BotMarket API        — scripts/trade/import-oec.ts       (source = 'oec')
--   * UN Comtrade Plus API     — scripts/trade/import-comtrade.ts  (source = 'comtrade')
--   * ITC TradeMap manual CSV  — scripts/trade/import-trademap.ts  (source = 'trademap')
--
-- `source` is part of the fact-table primary key — the one deliberate
-- departure from the 018 pattern. All three providers publish near-identical
-- facts (TradeMap and OEC both derive from UN Comtrade), so without it a
-- re-import from one provider would silently clobber another's rows. Readers
-- pin a preferred source per view instead of mixing providers in one series.

-- Dimension: reporters/partners. ISO 3166-1 alpha-2, plus the 'WLD'
-- pseudo-code for the world aggregate (TradeMap/Comtrade reporter 000).
-- lat/lng nullable — only needed if the epic map ships; populate from
-- apps/vizmaya-fyi/lib/energy-profile/countryCentroids.ts at that point.
create table if not exists trade_countries (
  code        text primary key,
  name        text not null,
  lat         double precision,
  lng         double precision,
  updated_at  timestamptz not null default now()
);

alter table trade_countries enable row level security;

create policy "Public read trade_countries"
  on trade_countries for select
  using (true);

-- Dimension: Harmonized System products. hs_level is explicit so HS2
-- chapters ('01') and HS4 headings ('0101') coexist without ambiguity;
-- parent_code links an HS4 heading to its HS2 chapter (and HS6 to HS4).
create table if not exists trade_products (
  hs_code     text primary key,
  hs_level    smallint not null check (hs_level in (2, 4, 6)),
  name        text not null,
  parent_code text,
  updated_at  timestamptz not null default now()
);

create index if not exists idx_trade_products_level on trade_products(hs_level);

alter table trade_products enable row level security;

create policy "Public read trade_products"
  on trade_products for select
  using (true);

-- Fact: exports by reporter × product × year, long format. Values are
-- nominal plain USD — importers normalise units (TradeMap publishes USD
-- thousands; Comtrade and OEC publish USD) before upserting.
-- reporter_code 'WLD' rows are the world-total-by-product series.
create table if not exists trade_product_exports (
  reporter_code text not null references trade_countries(code) on delete cascade,
  hs_code       text not null references trade_products(hs_code) on delete cascade,
  year          smallint not null,
  value_usd     double precision,
  source        text not null check (source in ('oec', 'comtrade', 'trademap')),
  primary key (reporter_code, hs_code, year, source)
);

create index if not exists idx_trade_product_exports_product
  on trade_product_exports(hs_code, year);

create index if not exists idx_trade_product_exports_reporter
  on trade_product_exports(reporter_code, source);

alter table trade_product_exports enable row level security;

create policy "Public read trade_product_exports"
  on trade_product_exports for select
  using (true);

-- Bilateral reporter × partner flows are deliberately out of scope for the
-- first ingestion (full HS4 bilateral grain is billions of rows). If scoped
-- in later, add alongside without touching the tables above:
--
-- create table if not exists trade_bilateral_flows (
--   reporter_code text not null references trade_countries(code),
--   partner_code  text not null references trade_countries(code),
--   hs_code       text not null,   -- HS2 only at bilateral grain (volume)
--   year          smallint not null,
--   flow          text not null check (flow in ('export', 'import')),
--   value_usd     double precision,
--   source        text not null,
--   primary key (reporter_code, partner_code, hs_code, year, flow, source)
-- );

-- Seed the epic as draft: the data/research phase ships first, and the
-- public-read policy on epics (015) only exposes published rows, so nothing
-- surfaces until the Phase-4 landing component exists and status is flipped.
insert into epics (slug, name, description, landing_component, status)
  values (
    'global-trade',
    'Global Trade',
    'World exports by product, top exporters, and trade flows over time.',
    'global-trade-map',
    'draft'
  )
  on conflict (slug) do nothing;
