-- 082: the market term of the Doom v Boom score — market caps + calibration.
--
-- The daily edition's score is 0.75 × the news reading + 0.25 × the tracked
-- stocks' previous session (dcEditionAssembly.ts, news+market-v1). The
-- session is read per AI layer: each layer's move is weighted by market cap,
-- then the four layers are averaged equally, so the eleven chip names don't
-- outvote the five hyperscalers.
--
--   dc_stocks.market_cap_usd_bn / market_cap_as_of
--       The cap weight. US tickers are refreshed by the stock importer from
--       massive.com's ticker reference (weekly; --refresh-caps forces it).
--       massive.com is US-only, so the international listings are set by
--       hand (update dc_stocks set market_cap_usd_bn = …, market_cap_as_of =
--       current_date where ticker = '005930.KS'); until they are, a ticker
--       without a cap weighs as its layer's median cap.
--
--   dc_mood_calibrations
--       One row per calibration run (calibrate-mood.ts --write). The composer
--       reads the newest: scale_pct is the average move that reads as ±0.76
--       (tanh 1), fitted so the market reading swings as much as the news
--       reading; market_weight is the market's share of the score. No row →
--       the code defaults (2%, 0.25). basis keeps what the fit saw.
--
-- Additive + idempotent.

alter table dc_stocks
  add column if not exists market_cap_usd_bn double precision
    check (market_cap_usd_bn is null or market_cap_usd_bn > 0),
  add column if not exists market_cap_as_of date;

create table if not exists dc_mood_calibrations (
  id             bigint generated always as identity primary key,
  calibrated_at  timestamptz not null default now(),
  scale_pct      double precision not null check (scale_pct > 0),
  market_weight  double precision not null check (market_weight >= 0 and market_weight <= 1),
  basis          jsonb not null default '{}'::jsonb,
  note           text
);

create index if not exists idx_dc_mood_calibrations_at on dc_mood_calibrations(calibrated_at desc);

-- Service role only (the composer and the calibration script); no public policy.
alter table dc_mood_calibrations enable row level security;
