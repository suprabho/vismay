-- 083: track Advantest, SoftBank Group and Hon Hai via their US OTC lines.
--
-- The home-exchange listings never got an automatic price feed: the Apify /
-- Yahoo path returned no bars, and hand-uploading Stooq CSVs isn't
-- maintainable. massive.com serves these three US OTC symbols (checked with
-- the importer's --probe), so — like TSM and ASML in 067 — they now import
-- with the US tickers every weekday and join the Doom v Boom market term,
-- which reads US-listed tickers only (getDcMarketStocks).
--
--   6857.T  → ATEYY  (Advantest ADR)
--   9984.T  → SFTBY  (SoftBank Group ADR)
--   2317.TW → HNHPF  (Hon Hai, US OTC ordinary line)
--
-- Not moved: Samsung (005930.KS), SK hynix (000660.KS), SMIC (0981.HK) and
-- Tokyo Electron (8035.T). massive.com has no bars for SSNLF / HXSCL, and
-- TOELY's bars stop on 2026-09-16 with no reference entry. They stay active
-- on their home exchanges for news tagging, without an automatic price feed
-- and outside the market term.
--
-- massive.com's ticker reference carries no market cap for OTC lines, so the
-- cap (a company-level USD figure) is carried over from the home row and
-- stays hand-maintained; the importer's weekly refresh never overwrites a cap
-- with nothing. The home rows are retired (is_active=false), not deleted, so
-- their history survives. Additive + idempotent.

insert into dc_stocks (ticker, name, exchange, market, currency, category, market_cap_usd_bn, market_cap_as_of)
select v.ticker, v.name, 'OTC', 'US', 'USD', v.category, h.market_cap_usd_bn, h.market_cap_as_of
from (values
  ('ATEYY', 'Advantest',         'semi-equipment', '6857.T'),
  ('SFTBY', 'SoftBank Group',    'data-centers',   '9984.T'),
  ('HNHPF', 'Hon Hai (Foxconn)', 'data-centers',   '2317.TW')
) as v(ticker, name, category, home)
left join dc_stocks h on h.ticker = v.home
on conflict (ticker) do update set
  name       = excluded.name,
  exchange   = excluded.exchange,
  market     = excluded.market,
  currency   = excluded.currency,
  category   = excluded.category,
  updated_at = now();

update dc_stocks
  set is_active = false, updated_at = now()
  where ticker in ('6857.T', '9984.T', '2317.TW') and is_active;

-- Remap historical news tags (dc_news.tickers is a plain text[], no FK).
update dc_news
  set tickers = array_replace(array_replace(array_replace(tickers, '6857.T', 'ATEYY'), '9984.T', 'SFTBY'), '2317.TW', 'HNHPF')
  where tickers && array['6857.T', '9984.T', '2317.TW'];
