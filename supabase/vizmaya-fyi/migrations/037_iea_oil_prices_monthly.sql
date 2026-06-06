-- IEA monthly end-user oil prices excerpt — gasoline, automotive diesel,
-- light fuel oil for ~33 countries (OECD + Brazil + India), 2015-01 onwards.
-- Updated monthly by the IEA; we ingest the public excerpt by hand.
--
-- Source: IEA Energy Prices Monthly Oil Prices Excerpt
-- https://www.iea.org/data-and-statistics/data-product/monthly-oil-price-statistics-2
--
-- Importer: scripts/energy-profile/import-iea-oil-prices.ts. The script reads
-- scripts/energy-profile/data/iea-oil-prices-monthly.csv (exported from the
-- IEA's xlsx excerpt) and upserts here. Stores both USD/L and national
-- currency so the country-detail chart can switch units later if needed.

create table if not exists iea_oil_prices_monthly (
  country_code  text not null references iea_countries(code) on delete cascade,
  product       text not null,   -- 'gasoline' | 'diesel' | 'light_fuel_oil'
  currency      text not null,   -- 'USD' | 'national'
  month         date not null,   -- first day of month
  value         double precision not null,
  primary key (country_code, product, currency, month)
);

create index if not exists idx_iea_oil_prices_monthly_country_product
  on iea_oil_prices_monthly(country_code, product, currency, month);

alter table iea_oil_prices_monthly enable row level security;

create policy "Public read iea_oil_prices_monthly"
  on iea_oil_prices_monthly for select
  using (true);
