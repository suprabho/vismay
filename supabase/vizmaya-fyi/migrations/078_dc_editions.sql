-- AI Data Centers epic — daily snapshot editions.
--
-- Second output of the epic beside the live explorer: one frozen edition a
-- day (08:15 → 08:15 UTC window, published at 09:00 UTC) that curates the
-- previous 24 hours of AI, energy and sustainability news into one static
-- page at /ai-data-centers/daily and /ai-data-centers/daily/[date].
-- PRD: docs/ai-data-centers-daily-snapshot-prd.md · design:
-- docs/ai-data-centers-daily-snapshot.html
--
-- Four changes, all here so the feature ships in one migration:
--
--   1. dc_news gains the tags the edition is built from — a layer, a place
--      + region, a theme, a mood, an energy flag and the extracted `facts`
--      (action, figures, horizon) the per-layer visualisations read. The
--      classifier (scripts/ai-data-centers/scrape-news.ts) writes them in
--      the same Haiku call that already sets topics + tickers.
--   2. dc_places — the seeded place list the classifier picks from, with
--      coordinates, so pins never need geocoding at render time.
--   3. dc_papers — one row per arXiv paper kept by the papers gate
--      (scripts/ai-data-centers/ingest-papers.ts).
--   4. dc_editions — one row per edition; the row IS the page. Publishing
--      freezes it (status + membership arrays); a trigger rejects any later
--      update, so re-classification or deletion in dc_news can never change
--      a published edition. Corrections run in the next edition.
--
-- dc_news_recaps (066) stays for the admin Recaps timeline; editions
-- supersede it for the public.
--
-- Composer: apps/vizmaya-fyi/scripts/ai-data-centers/compose-edition.ts
-- Publish:  apps/vizmaya-fyi/scripts/ai-data-centers/publish-edition.ts
-- Readers:  packages/content-source/src/dcEditions.ts (re-exported from epics.ts)

-- ---------------------------------------------------------------------------
-- 1. dc_news tags

alter table dc_news
  add column if not exists layer  text
    check (layer is null or layer in ('dc', 'hyper', 'semi', 'equip')),
  add column if not exists place  text,                       -- dc_places.slug, or null
  add column if not exists region text
    check (region is null or region in ('na', 'ea', 'eu', 'me', 'other')),
  add column if not exists theme  text
    check (theme is null or theme in
      ('power', 'permit', 'memory', 'capacity', 'equip', 'chips', 'sustain')),
  add column if not exists mood   smallint
    check (mood is null or mood in (-1, 0, 1)),               -- -1 doom · 0 neutral · 1 boom
  add column if not exists energy boolean not null default false,
  -- {action, figures:[{value, unit, label}], horizon:{from, to}} — see
  -- DcStoryFacts in packages/content-source/src/dcEditions.ts.
  add column if not exists facts  jsonb,
  -- Prompt version that produced the tags (risk: classifier drift shifts the
  -- mood series / field baselines mid-series — recompute per version).
  add column if not exists classifier_version text;

create index if not exists idx_dc_news_layer  on dc_news (layer)  where relevant;
create index if not exists idx_dc_news_place  on dc_news (place)  where relevant;
create index if not exists idx_dc_news_energy on dc_news (published_at desc) where energy;

comment on column dc_news.layer  is 'AI layer: dc | hyper | semi | equip (matches dc_stocks.category)';
comment on column dc_news.place  is 'dc_places.slug the story is about, or null';
comment on column dc_news.region is 'na | ea | eu | me | other';
comment on column dc_news.theme  is 'power | permit | memory | capacity | equip | chips | sustain';
comment on column dc_news.mood   is '-1 doom · 0 neutral · 1 boom';
comment on column dc_news.facts  is '{action, figures:[{value, unit, label}], horizon:{from, to}}';

-- ---------------------------------------------------------------------------
-- 2. dc_places — the classifier's place vocabulary + map coordinates.

create table if not exists dc_places (
  slug       text primary key,
  name       text not null,
  region     text not null check (region in ('na', 'ea', 'eu', 'me', 'other')),
  lat        double precision not null,
  lng        double precision not null,
  -- Free-text hints for the classifier ("Loudoun County", "Data Center Alley").
  aliases    text[] not null default '{}',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table dc_places enable row level security;

drop policy if exists "Public read dc_places" on dc_places;
create policy "Public read dc_places"
  on dc_places for select
  using (true);

insert into dc_places (slug, name, region, lat, lng, aliases) values
  -- North America
  ('abilene',      'Abilene, TX',        'na',  32.45,  -99.73, '{"Stargate","West Texas"}'),
  ('n-virginia',   'Northern Virginia',  'na',  39.04,  -77.49, '{"Loudoun","Ashburn","Data Center Alley","Prince William"}'),
  ('columbus',     'Columbus, OH',       'na',  39.96,  -83.00, '{"New Albany","Ohio"}'),
  ('boise',        'Boise, ID',          'na',  43.62, -116.21, '{"Idaho"}'),
  ('louisiana',    'Louisiana',          'na',  32.35,  -91.75, '{"Richland Parish","Hyperion"}'),
  ('phoenix',      'Phoenix, AZ',        'na',  33.45, -112.07, '{"Arizona","Mesa","Chandler"}'),
  ('dallas',       'Dallas–Fort Worth',  'na',  32.78,  -96.80, '{"DFW","Fort Worth"}'),
  ('atlanta',      'Atlanta, GA',        'na',  33.75,  -84.39, '{"Georgia"}'),
  ('chicago',      'Chicago, IL',        'na',  41.88,  -87.63, '{"Illinois"}'),
  ('santa-clara',  'Silicon Valley',     'na',  37.35, -121.95, '{"Santa Clara","San Jose","Bay Area"}'),
  ('seattle',      'Seattle, WA',        'na',  47.61, -122.33, '{"Redmond","Quincy","Oregon","Hillsboro"}'),
  ('memphis',      'Memphis, TN',        'na',  35.15,  -90.05, '{"Colossus"}'),
  ('montreal',     'Montréal',           'na',  45.50,  -73.57, '{"Quebec","Canada"}'),
  -- East Asia
  ('seoul',        'Seoul',              'ea',  37.57,  126.98, '{"Korea","Icheon","Pyeongtaek"}'),
  ('hsinchu',      'Hsinchu',            'ea',  24.80,  120.97, '{"Taiwan","Taichung","Kaohsiung","Chiayi"}'),
  ('tokyo',        'Tokyo',              'ea',  35.68,  139.69, '{"Japan","Osaka","Hokkaido"}'),
  ('shanghai',     'Shanghai',           'ea',  31.23,  121.47, '{"Shenzhen","Hangzhou"}'),
  ('beijing',      'Beijing',            'ea',  39.90,  116.40, '{"China"}'),
  ('singapore',    'Singapore',          'ea',   1.35,  103.82, '{"Johor","Malaysia","Batam"}'),
  -- Europe
  ('dublin',       'Dublin',             'eu',  53.35,   -6.26, '{"Ireland"}'),
  ('amsterdam',    'Amsterdam',          'eu',  52.37,    4.90, '{"Netherlands","Eemshaven"}'),
  ('veldhoven',    'Veldhoven',          'eu',  51.42,    5.40, '{"Eindhoven"}'),
  ('frankfurt',    'Frankfurt',          'eu',  50.11,    8.68, '{"Germany"}'),
  ('london',       'London',             'eu',  51.51,   -0.13, '{"UK","Britain","Slough"}'),
  ('paris',        'Paris',              'eu',  48.86,    2.35, '{"France","Marseille"}'),
  ('oslo',         'Nordics',            'eu',  59.91,   10.75, '{"Norway","Sweden","Finland","Denmark","Stockholm","Copenhagen"}'),
  ('madrid',       'Iberia',             'eu',  40.42,   -3.70, '{"Spain","Portugal","Aragon","Lisbon","Sines"}'),
  -- India & Middle East
  ('jamnagar',     'Jamnagar',           'me',  22.47,   70.06, '{"Gujarat","Reliance"}'),
  ('mumbai',       'Mumbai',             'me',  19.08,   72.88, '{"Navi Mumbai","Pune","India"}'),
  ('bengaluru',    'Bengaluru',          'me',  12.97,   77.59, '{"Bangalore","Chennai","Hyderabad"}'),
  ('abu-dhabi',    'Abu Dhabi',          'me',  24.45,   54.38, '{"UAE","Dubai","Stargate UAE"}'),
  ('riyadh',       'Riyadh',             'me',  24.71,   46.68, '{"Saudi","NEOM","Humain"}'),
  ('doha',         'Doha',               'me',  25.29,   51.53, '{"Qatar"}'),
  -- Rest of world
  ('sydney',       'Sydney',             'other', -33.87, 151.21, '{"Australia","Melbourne"}'),
  ('sao-paulo',    'São Paulo',          'other', -23.55, -46.63, '{"Brazil","Campinas"}'),
  ('johannesburg', 'Johannesburg',       'other', -26.20,  28.05, '{"South Africa","Nairobi","Lagos"}')
on conflict (slug) do update set
  name    = excluded.name,
  region  = excluded.region,
  lat     = excluded.lat,
  lng     = excluded.lng,
  aliases = excluded.aliases;

-- ---------------------------------------------------------------------------
-- 3. dc_papers — arXiv papers that passed the gate (rejects persist with
-- relevant=false so the next run's "already seen" lookup skips them, same
-- contract as dc_news).

create table if not exists dc_papers (
  arxiv_id           text primary key,                -- '2609.11902' (no version suffix)
  title              text not null,
  abstract           text,
  authors            text,                            -- 'Novak, Adeyemi, Sørensen'
  affiliations       text,                            -- 'Google DeepMind'
  kind               text check (kind is null or kind in ('lab', 'academic', 'mixed')),
  category           text,                            -- primary arXiv category, e.g. cs.CL
  area               text check (area is null or area in
                       ('reason', 'arch', 'infer', 'multi', 'align', 'evalb')),
  bench              text,                            -- benchmark / metric the headline result is on
  baseline           double precision,
  result             double precision,
  unit               text,                            -- 'pts' | '×' | '%' | ''
  compute_bucket     smallint check (compute_bucket is null or compute_bucket between 0 and 3),
  scale              text,                            -- '70B-class', 'probe on 4 families', …
  weights_released   boolean not null default false,
  code_released      boolean not null default false,
  why                text,                            -- one line: why it matters
  tags               text[] not null default '{}',
  -- 1–5 from the gate: how much the paper bears on data-center-scale or
  -- frontier AI. The composer keeps the top 8 per edition.
  importance         smallint check (importance is null or importance between 1 and 5),
  relevant           boolean not null default true,
  published_at       timestamptz not null,            -- arXiv v1 submission time
  fetched_at         timestamptz not null default now(),
  classifier_version text
);

create index if not exists idx_dc_papers_published on dc_papers (published_at desc) where relevant;
create index if not exists idx_dc_papers_area      on dc_papers (area) where relevant;

alter table dc_papers enable row level security;

drop policy if exists "Public read dc_papers" on dc_papers;
create policy "Public read dc_papers"
  on dc_papers for select
  using (relevant);

-- ---------------------------------------------------------------------------
-- 4. dc_editions — the row is the page.

create table if not exists dc_editions (
  id                 uuid primary key default gen_random_uuid(),
  -- Sequential public edition number, assigned at publish.
  number             int,
  edition_date       date not null unique,
  window_start       timestamptz not null,              -- 08:15 UTC the day before
  window_end         timestamptz not null,              -- 08:15 UTC on edition_date
  status             text not null default 'draft' check (status in ('draft', 'published')),
  headline           text not null default '',
  sub                text not null default '',
  -- 6 × {metric, unit, label, text, sources:[{name, url}], energy}
  notes              jsonb not null default '[]'::jsonb,
  -- (boom − doom) / (boom + doom); null when nothing was scored
  mood_score         numeric,
  mood_counts        jsonb not null default '{"boom":0,"doom":0,"neutral":0}'::jsonb,
  -- [{date, score}] — the last 30 daily readings up to and including this
  -- edition, frozen with it so the sparkline never re-queries.
  mood_series        jsonb not null default '[]'::jsonb,
  -- per layer {headline, sub, notes:[{text, sources}], count, viz}
  layers             jsonb not null default '{}'::jsonb,
  -- {headline, sub, paper_ids[], field_baseline, notice}
  research           jsonb not null default '{}'::jsonb,
  -- {hero:{value, unit, label}, composition:[{label, gw}], per_edition:[…], figures:[…], story_count, links}
  energy             jsonb not null default '{}'::jsonb,
  -- {places:[{slug, name, region, lat, lng, count, energy}], regions:[{key, count, by_layer}]}
  geo                jsonb not null default '{}'::jsonb,
  -- Day's close vs prior close for every active ticker, sorted by move.
  tape               jsonb not null default '[]'::jsonb,
  -- {stories, papers, tickers, places, energy, links, outlets}
  counts             jsonb not null default '{}'::jsonb,
  -- The frozen membership. The page renders from these arrays, never by window.
  story_ids          bigint[] not null default '{}',
  paper_ids          text[] not null default '{}',
  iea_ids            bigint[] not null default '{}',
  -- Provenance
  model              text,                             -- gemini model, or 'deterministic'
  classifier_version text,
  -- Every composer run's text output, newest last: [{generated_at, model, text}].
  -- The admin diffs the current text against the previous run.
  composer_runs      jsonb not null default '[]'::jsonb,
  -- Dot-paths the editor changed ('headline', 'notes.2.text', 'layers.semi.sub').
  -- A recompose keeps these unless it is told to clear them.
  edited_fields      text[] not null default '{}',
  -- When publish-edition.ts freezes the draft (09:00 UTC; Hold adds 30 min, once).
  auto_publish_at    timestamptz,
  hold_count         int not null default 0,
  generated_at       timestamptz,
  reviewed_by        text,
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists idx_dc_editions_number
  on dc_editions (number) where number is not null;
create index if not exists idx_dc_editions_status_date
  on dc_editions (status, edition_date desc);
-- Only one draft at a time: the composer publishes a stale draft before it
-- opens the next one.
create unique index if not exists idx_dc_editions_single_draft
  on dc_editions (status) where status = 'draft';

alter table dc_editions enable row level security;

drop policy if exists "Public read published dc_editions" on dc_editions;
create policy "Public read published dc_editions"
  on dc_editions for select
  using (status = 'published');

-- A published edition is immutable. The only update a published row accepts
-- is the rare unpublish switch (status back to draft) — everything else is a
-- correction that belongs in the next edition.
create or replace function dc_editions_guard_published()
returns trigger as $$
begin
  if old.status = 'published' and new.status = 'published' then
    raise exception 'dc_editions: edition % is published and cannot be updated', old.edition_date;
  end if;
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists dc_editions_guard on dc_editions;
create trigger dc_editions_guard
  before update on dc_editions
  for each row execute function dc_editions_guard_published();

-- ---------------------------------------------------------------------------
-- 5. Editor audit — every draft save writes an ai_generations row (kind
-- 'edition_edit', model 'editor', prompt = the patch) so edits sit in the
-- same audit table image generation already uses.

alter table ai_generations drop constraint if exists ai_generations_kind_check;
alter table ai_generations
  add constraint ai_generations_kind_check
  check (kind in ('image', 'text', 'edition_edit'));
