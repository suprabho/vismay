-- AI Data Centers epic — news feed + related-stock market data.
--
-- Two daily pipelines extend the /ai-data-centers explorer beyond the Epoch
-- facility registry (migration 063):
--
--   * dc_news         — Google News RSS coverage of AI, data centers,
--                       microprocessors and semiconductors, tagged by Gemma
--                       with topic + ticker labels.
--                       Scraper: apps/vizmaya-fyi/scripts/ai-data-centers/scrape-news.ts
--                       Cron:    .github/workflows/scrape-ai-data-centers-news.yml
--   * dc_stocks       — curated registry of related listed companies, each on
--                       its home exchange (chips on NASDAQ/TWSE/KRX/HKEX,
--                       equipment on Euronext/TSE, hyperscalers + data-center
--                       operators on US exchanges). Seeded below; the news
--                       tagger and the price importer both read this table,
--                       so adding a company is a single insert.
--   * dc_stock_prices — daily OHLCV bars per ticker from Yahoo Finance's
--                       chart API, in each listing's native currency.
--                       Importer: apps/vizmaya-fyi/scripts/ai-data-centers/import-stock-prices.ts
--                       Cron:     .github/workflows/import-dc-stock-prices.yml

-- News articles. Natural key = source_url (Google News redirect URLs are
-- stable per article, so re-runs are no-ops — same idempotency contract as
-- iea_news in migration 015). Articles the classifier rejects are stored with
-- relevant=false rather than skipped: the URL then exists in the table and the
-- next run's "already seen" lookup avoids re-sending them to the LLM. Readers
-- filter on relevant=true.
create table if not exists dc_news (
  id           bigint generated always as identity primary key,
  source_url   text not null unique,
  title        text not null,
  summary      text,
  source       text,                          -- outlet name (Reuters, Bloomberg, …)
  published_at timestamptz not null,
  relevant     boolean not null default true,
  topics       text[] not null default '{}', -- 'ai' | 'data-centers' | 'semiconductors' | 'microprocessors'
  tickers      text[] not null default '{}', -- dc_stocks.ticker values named in the story
  raw          jsonb,
  fetched_at   timestamptz not null default now()
);

create index if not exists idx_dc_news_published on dc_news(published_at desc);
create index if not exists idx_dc_news_topics    on dc_news using gin (topics);
create index if not exists idx_dc_news_tickers   on dc_news using gin (tickers);

-- Tracked companies. ticker is the Yahoo Finance symbol of the *home* listing
-- (2330.TW, 005930.KS, ASML.AS, 8035.T, 0981.HK, …) so each series moves in
-- its own market and currency. is_active=false retires a ticker from the
-- daily fetch and the news tagger without dropping its price history.
create table if not exists dc_stocks (
  ticker     text primary key,
  name       text not null,
  exchange   text not null,
  market     text not null,   -- ISO-ish market code: US | TW | KR | JP | NL | HK
  currency   text not null,
  category   text not null check (category in
               ('semiconductors', 'semi-equipment', 'hyperscalers', 'data-centers')),
  is_active  boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Daily bars, one row per (ticker, trading day in the exchange's own
-- calendar). close is split-adjusted (Yahoo v8 chart semantics). Re-running
-- the importer overwrites any partial bar written mid-session.
create table if not exists dc_stock_prices (
  ticker     text not null references dc_stocks(ticker) on delete cascade,
  trade_date date not null,
  open       double precision,
  high       double precision,
  low        double precision,
  close      double precision not null,
  volume     bigint,
  primary key (ticker, trade_date)
);

create index if not exists idx_dc_stock_prices_ticker_date
  on dc_stock_prices(ticker, trade_date);

alter table dc_news         enable row level security;
alter table dc_stocks       enable row level security;
alter table dc_stock_prices enable row level security;

create policy "Public read dc_news"
  on dc_news for select
  using (true);

create policy "Public read dc_stocks"
  on dc_stocks for select
  using (true);

create policy "Public read dc_stock_prices"
  on dc_stock_prices for select
  using (true);

-- Seed the ticker registry. on conflict updates the descriptive columns but
-- deliberately not is_active, so manually retiring a ticker survives re-runs.
insert into dc_stocks (ticker, name, exchange, market, currency, category) values
  -- Chip designers, foundries, memory — each on its home exchange
  ('NVDA',      'NVIDIA',              'NASDAQ',              'US', 'USD', 'semiconductors'),
  ('AMD',       'Advanced Micro Devices', 'NASDAQ',           'US', 'USD', 'semiconductors'),
  ('INTC',      'Intel',               'NASDAQ',              'US', 'USD', 'semiconductors'),
  ('AVGO',      'Broadcom',            'NASDAQ',              'US', 'USD', 'semiconductors'),
  ('QCOM',      'Qualcomm',            'NASDAQ',              'US', 'USD', 'semiconductors'),
  ('MU',        'Micron Technology',   'NASDAQ',              'US', 'USD', 'semiconductors'),
  ('ARM',       'Arm Holdings',        'NASDAQ',              'US', 'USD', 'semiconductors'),
  ('2330.TW',   'TSMC',                'TWSE',                'TW', 'TWD', 'semiconductors'),
  ('005930.KS', 'Samsung Electronics', 'KRX',                 'KR', 'KRW', 'semiconductors'),
  ('000660.KS', 'SK hynix',            'KRX',                 'KR', 'KRW', 'semiconductors'),
  ('0981.HK',   'SMIC',                'HKEX',                'HK', 'HKD', 'semiconductors'),
  -- Semiconductor manufacturing equipment
  ('ASML.AS',   'ASML',                'Euronext Amsterdam',  'NL', 'EUR', 'semi-equipment'),
  ('AMAT',      'Applied Materials',   'NASDAQ',              'US', 'USD', 'semi-equipment'),
  ('LRCX',      'Lam Research',        'NASDAQ',              'US', 'USD', 'semi-equipment'),
  ('KLAC',      'KLA',                 'NASDAQ',              'US', 'USD', 'semi-equipment'),
  ('8035.T',    'Tokyo Electron',      'TSE',                 'JP', 'JPY', 'semi-equipment'),
  ('6857.T',    'Advantest',           'TSE',                 'JP', 'JPY', 'semi-equipment'),
  -- Hyperscalers driving AI data-center capex
  ('MSFT',      'Microsoft',           'NASDAQ',              'US', 'USD', 'hyperscalers'),
  ('GOOGL',     'Alphabet',            'NASDAQ',              'US', 'USD', 'hyperscalers'),
  ('AMZN',      'Amazon',              'NASDAQ',              'US', 'USD', 'hyperscalers'),
  ('META',      'Meta Platforms',      'NASDAQ',              'US', 'USD', 'hyperscalers'),
  ('ORCL',      'Oracle',              'NYSE',                'US', 'USD', 'hyperscalers'),
  -- Data-center operators, AI clouds, servers, power/cooling
  ('EQIX',      'Equinix',             'NASDAQ',              'US', 'USD', 'data-centers'),
  ('DLR',       'Digital Realty',      'NYSE',                'US', 'USD', 'data-centers'),
  ('VRT',       'Vertiv',              'NYSE',                'US', 'USD', 'data-centers'),
  ('SMCI',      'Super Micro Computer','NASDAQ',              'US', 'USD', 'data-centers'),
  ('CRWV',      'CoreWeave',           'NASDAQ',              'US', 'USD', 'data-centers'),
  ('2317.TW',   'Hon Hai (Foxconn)',   'TWSE',                'TW', 'TWD', 'data-centers'),
  ('9984.T',    'SoftBank Group',      'TSE',                 'JP', 'JPY', 'data-centers')
on conflict (ticker) do update set
  name       = excluded.name,
  exchange   = excluded.exchange,
  market     = excluded.market,
  currency   = excluded.currency,
  category   = excluded.category,
  updated_at = now();
