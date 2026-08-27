-- Global Trade: bilateral reporter × partner flows at HS2 grain, scoped to
-- pairs among the tracked reporter set (scripts/trade/reporters.ts). This is
-- the table 064 sketched but deferred — the trade-web viz (country↔country
-- edges, width = chapter volume) needs it, and at intra-tracked-pair HS2
-- grain it stays small: 20×19 pairs × ~97 chapters × 2 flows ≈ 74k rows/year
-- (~1.9M for the full 2001+ history), two Comtrade calls per year.
--
-- Both flow directions are stored even though X and M mirror each other in
-- principle: reported exports and reported imports disagree in practice
-- (CIF/FOB, timing, attribution), so the viz offers each as its own lens
-- rather than mixing them.
--
-- Importer: scripts/trade/import-comtrade-bilateral.ts (source='comtrade').

create table if not exists trade_bilateral_flows (
  reporter_code text not null references trade_countries(code) on delete cascade,
  partner_code  text not null references trade_countries(code) on delete cascade,
  hs_code       text not null references trade_products(hs_code) on delete cascade,
  year          smallint not null,
  flow          text not null check (flow in ('export', 'import')),
  value_usd     double precision,
  source        text not null check (source in ('oec', 'comtrade', 'trademap')),
  primary key (reporter_code, partner_code, hs_code, year, flow, source)
);

-- The web reader slices one (year, flow) and wants the biggest values first.
create index if not exists idx_trade_bilateral_year_flow
  on trade_bilateral_flows(year, flow, value_usd desc);

alter table trade_bilateral_flows enable row level security;

create policy "Public read trade_bilateral_flows"
  on trade_bilateral_flows for select
  using (true);
