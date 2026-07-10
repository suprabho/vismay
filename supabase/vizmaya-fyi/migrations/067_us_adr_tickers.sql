-- Track TSMC and ASML via their US ADRs (TSM on NYSE, ASML on NASDAQ, both
-- USD) instead of their home listings (2330.TW, ASML.AS), so their daily
-- bars come from massive.com automatically with the other US tickers rather
-- than through the Apify/Stooq intl paths. Deliberate deviations from the
-- home-exchange convention in migration 065 — the remaining intl names
-- (Samsung, SK hynix, SMIC, Hon Hai, Tokyo Electron, Advantest, SoftBank)
-- trade US-side only OTC, if at all, so they stay on their home exchanges.
-- The home rows are retired per the dc_stocks contract (is_active=false —
-- the 065 seed upsert deliberately never touches is_active), not deleted,
-- so any existing history survives. Idempotent.

insert into dc_stocks (ticker, name, exchange, market, currency, category) values
  ('TSM',  'TSMC', 'NYSE',   'US', 'USD', 'semiconductors'),
  ('ASML', 'ASML', 'NASDAQ', 'US', 'USD', 'semi-equipment')
on conflict (ticker) do update set
  name       = excluded.name,
  exchange   = excluded.exchange,
  market     = excluded.market,
  currency   = excluded.currency,
  category   = excluded.category,
  updated_at = now();

update dc_stocks
  set is_active = false, updated_at = now()
  where ticker in ('2330.TW', 'ASML.AS') and is_active;

-- Remap historical news tags so the admin pipeline ticker breakdown stays
-- coherent (dc_news.tickers is a plain text[], no FK).
update dc_news
  set tickers = array_replace(array_replace(tickers, '2330.TW', 'TSM'), 'ASML.AS', 'ASML')
  where '2330.TW' = any(tickers) or 'ASML.AS' = any(tickers);
