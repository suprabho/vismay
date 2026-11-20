-- 106: track Anthropic and SpaceX in AI Daily (dc_stocks).
--
-- Both pipelines read dc_stocks: the news classifier tags stories with these
-- tickers, and the stock importer pulls their daily bars from massive.com.
--
--   SPCX  SpaceX, Nasdaq since the 2026-06-12 IPO.
--   ANT   Anthropic, Nasdaq since the 2026-11-19 IPO.
--
-- Both are plain US rows, so they also join the Doom v Boom market term, in
-- the hyperscaler layer (SpaceX owns xAI and its Colossus compute; Anthropic
-- is a frontier lab and one of the largest compute buyers).
--
-- An earlier draft of this migration added Anthropic as a private, news-only
-- row (ticker 'ANTHROPIC'). If that draft was applied, the row is retired and
-- its news tags are remapped to ANT; otherwise those statements are no-ops.
--
-- After applying: dispatch import-dc-stock-prices with full_backfill=true and
-- refresh_caps=true (bars since each IPO plus market caps), then dispatch the
-- scrape with retag_days=2 so the current window picks up the new tickers.
-- ANT has a single session so far: it sits out the market term's day-over-day
-- move until its second close. Additive + idempotent.

insert into dc_stocks (ticker, name, exchange, market, currency, category) values
  ('SPCX', 'SpaceX',    'NASDAQ', 'US', 'USD', 'hyperscalers'),
  ('ANT',  'Anthropic', 'NASDAQ', 'US', 'USD', 'hyperscalers')
on conflict (ticker) do update set
  name       = excluded.name,
  exchange   = excluded.exchange,
  market     = excluded.market,
  currency   = excluded.currency,
  category   = excluded.category,
  updated_at = now();

update dc_stocks
  set is_active = false, updated_at = now()
  where ticker = 'ANTHROPIC' and is_active;

update dc_news
  set tickers = array_replace(tickers, 'ANTHROPIC', 'ANT')
  where tickers && array['ANTHROPIC'];
