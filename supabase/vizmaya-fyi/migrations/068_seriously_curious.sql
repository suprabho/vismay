-- Seriously Curious — the Economist book "The Facts and Figures That Turn Our
-- World Upside Down", scraped into 109 self-contained fact-articles so its
-- chapters/facts can be attached as grounded sources in the story composer.
--
-- Source corpus + ingest notes: vizmaya-data/seriously-curious/{README,INGEST_NOTES}.md
-- Importer: apps/vizmaya-fyi/scripts/seriously-curious/import.ts (pnpm seriously-curious:import).
-- Composer provider: apps/admin/lib/libraryProviders.ts (`book-facts`, search-based).
--
-- The unit of storage is one row per article — that's the granularity the
-- composer grounds a story on. The table is book-generic (keyed by epic_slug
-- with a denormalized book_name) so future reference books reuse it and the
-- one `book-facts` provider without new code.

-- One row per article. `body` is the full ~500-word prose (the extractable
-- "chapter/fact" the provider snapshots as a source). entities/keywords/facts
-- are jsonb string arrays of heuristic tags (see INGEST_NOTES). slug is the
-- kebab title, unique within a book.
create table if not exists book_articles (
  id             uuid primary key default gen_random_uuid(),
  epic_slug      text not null references epics(slug) on delete cascade,
  book_name      text not null,
  slug           text not null,
  section        text not null,
  section_index  int  not null default 0,
  article_index  int  not null default 0,
  title          text not null,
  page_start     int,
  page_end       int,
  char_count     int,
  entities       jsonb not null default '[]'::jsonb,
  keywords       jsonb not null default '[]'::jsonb,
  facts          jsonb not null default '[]'::jsonb,
  body           text not null,
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (epic_slug, slug)
);

create index if not exists idx_book_articles_epic    on book_articles(epic_slug);
create index if not exists idx_book_articles_section on book_articles(epic_slug, section_index, article_index);

alter table book_articles enable row level security;

create policy "Public read book_articles"
  on book_articles for select
  using (true);

-- Seed the epic row. Draft + hidden from home — there's no landing page; this
-- book is a composer source corpus, not a public interactive. landing_component
-- is metadata only (nothing switches on it while draft). Explainer/takeaways/
-- keywords (migration 058 fields) let the `epic` library provider surface the
-- book at epic level too. on-conflict keeps the seed authoritative on re-run.
insert into epics (
  slug, name, description, landing_component, status, app_slug, show_on_home,
  explainer, takeaways, keywords
)
  values (
    'seriously-curious',
    'Seriously Curious',
    'The Economist''s "Seriously Curious" — 109 short, fact-dense explainers, from why there''s a shortage of sand to how football transfers work.',
    'book-facts',
    'draft',
    'vizmaya-fyi',
    false,
    'A reference corpus for the story composer: _Seriously Curious: The Facts and Figures That Turn Our World Upside Down_ (The Economist, ed. Tom Standage). 109 self-contained explainer articles across 10 themes — unexpected explanations, global oddities, food and drink, economics, science and health, technology, sport, language and holidays. Each article is a quotable ~500-word unit of fact that a composed story can be grounded on.',
    '["109 fact-dense explainer articles across 10 themes", "Each article is a self-contained, quotable ~500-word unit", "Searchable full-text in the composer''s Book facts source", "Sourced from The Economist''s Seriously Curious (ed. Tom Standage)"]'::jsonb,
    '["facts", "figures", "explainers", "the economist", "seriously curious", "trivia", "data stories"]'::jsonb
  )
  on conflict (slug) do update set
    name              = excluded.name,
    description       = excluded.description,
    landing_component = excluded.landing_component,
    status            = excluded.status,
    app_slug          = excluded.app_slug,
    show_on_home      = excluded.show_on_home,
    explainer         = excluded.explainer,
    takeaways         = excluded.takeaways,
    keywords          = excluded.keywords,
    updated_at        = now();
