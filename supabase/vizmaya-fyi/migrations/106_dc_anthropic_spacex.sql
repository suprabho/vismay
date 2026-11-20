-- 106: track Anthropic and SpaceX in AI Daily (dc_stocks).
--
-- Both pipelines read dc_stocks: the news classifier tags stories with these
-- tickers, and the stock importer pulls prices for the listed ones.
--
--   SPCX       SpaceX, Nasdaq since the 2026-06-12 IPO. A normal US row:
--              massive.com serves its bars, the importer refreshes its cap,
--              and it joins the Doom v Boom market term in the hyperscaler
--              layer (SpaceX owns xAI and its Colossus compute).
--   ANTHROPIC  Anthropic is private: no listing, no prices. market='PRIVATE'
--              keeps it out of the price importer (US-only and international
--              paths both skip it), the admin international-upload panel, and
--              the market term (which reads market='US' only). It is still in
--              the classifier's ticker list, so Anthropic stories get tagged
--              and counted in the hyperscaler layer.
--
-- After applying: dispatch import-dc-stock-prices with full_backfill=true and
-- refresh_caps=true (SPCX history from the IPO plus its market cap), then
-- dispatch the scrape with retag_days=2 so the current window picks up the
-- new tickers. Additive + idempotent.

insert into dc_stocks (ticker, name, exchange, market, currency, category) values
  ('SPCX',      'SpaceX',    'NASDAQ',  'US',      'USD', 'hyperscalers'),
  ('ANTHROPIC', 'Anthropic', 'Private', 'PRIVATE', 'USD', 'hyperscalers')
on conflict (ticker) do update set
  name       = excluded.name,
  exchange   = excluded.exchange,
  market     = excluded.market,
  currency   = excluded.currency,
  category   = excluded.category,
  updated_at = now();
