-- 101_curious_claims.sql — the Curious Desk's provenance-first claim store.
--
-- A two-stage pipeline: broad discovery sources (GDELT news, Library of
-- Congress, Europeana, Gallica) fill curious_documents; a rule pass plus a
-- schema-constrained model pass turns passages into atomic curious_claims,
-- each carrying its evidence span; Crossref, Google Books and Wikidata add
-- curious_claim_sources rows; a grader computes an A to E evidence grade from
-- explicit features (score_features), never from prose; a human approves on
-- the admin Curious claims tab; only approved claims reach the Curious Desk
-- (curious_claim_pool) and the composer's "Curious claims" library.
--
-- Provenance rules the schema enforces: a document keeps its canonical URL,
-- retrieval time, rights and content hash; a claim keeps a verbatim evidence
-- quote of at most 300 characters with offsets (the only copyrighted text
-- ever stored for a news source; full text is kept only where the source
-- policy row says 'full', i.e. public-domain library material); a supporting
-- source carries an independence_group so five articles from one wire story
-- count as one lineage.
--
-- Writers:  apps/vizmaya-fyi/scripts/curious/{collect,detect,grade,verify}.ts
--           (packages/curious-pipeline)
-- Review:   apps/admin/app/vizmaya/(tabbed)/curious
-- Readers:  packages/randomizer/src/spins.ts loadCuriousPool (the desk),
--           apps/admin/lib/libraryProviders.ts (composer sources)
--
-- Service-role only (RLS on, no policies), like html_stories. Additive and
-- idempotent; safe to re-run.

-- The source policy registry: what each source allows, read before any fetch.
create table if not exists curious_sources (
  id                   text primary key,          -- 'gdelt','loc','europeana','gallica','crossref','google-books','wikidata','web'
  name                 text not null,
  kind                 text not null check (kind in ('news-index','library','aggregator','registry','web')),
  base_url             text,
  allowed_method       text not null check (allowed_method in ('api','sru','iiif','html','none')),
  crawl_delay_ms       integer not null default 1000,
  rate_per_min         integer,
  retention_days       integer not null default 365,
  commercial_reuse     boolean not null default false,
  fulltext_storage     text not null default 'none' check (fulltext_storage in ('none','snippet','full')),
  personal_data_policy text not null default 'public-figures' check (personal_data_policy in ('none','public-figures','all')),
  terms_url            text,
  terms_last_checked   date,
  enabled              boolean not null default true,
  notes                text,
  updated_at           timestamptz not null default now()
);

insert into curious_sources (id, name, kind, base_url, allowed_method, crawl_delay_ms, rate_per_min, retention_days, commercial_reuse, fulltext_storage, personal_data_policy, terms_url, terms_last_checked, enabled, notes) values
  ('gdelt',        'GDELT DOC 2.0',          'news-index', 'https://api.gdeltproject.org/api/v2/doc/doc', 'api',  5000, 12,  365, false, 'none',    'public-figures', 'https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/', '2026-11-04', true,  'One request every 5 seconds. Article URLs are a candidate queue: the publisher page is fetched at detect time under the web policy and never stored.'),
  ('loc',          'Library of Congress',    'library',    'https://www.loc.gov',                          'api',  1200, 40,  3650, true,  'full',    'public-figures', 'https://www.loc.gov/apis/json-and-yaml/', '2026-11-04', true,  'No key. Rate limited per endpoint; pagination past about 100,000 items is refused, so partition by facet. Full text kept only for public-domain items (before 1930).'),
  ('europeana',    'Europeana',              'aggregator', 'https://api.europeana.eu/record/v2',           'api',  500,  100, 3650, false, 'snippet', 'public-figures', 'https://pro.europeana.eu/page/api-terms-of-use', '2026-11-04', true,  'Needs EUROPEANA_API_KEY. Text stored only where the item rights are CC0 or Public Domain Mark; otherwise the description snippet.'),
  ('gallica',      'BnF Gallica',            'library',    'https://gallica.bnf.fr',                       'sru',  12000, 5,  3650, true,  'full',    'public-figures', 'https://gallica.bnf.fr/html/und/conditions-dutilisation-des-contenus-de-gallica', '2026-11-04', true,  'Five calls a minute. Discovery by SRU, OCR snippets by ContentSearch, never whole texteBrut in a run.'),
  ('crossref',     'Crossref',               'registry',   'https://api.crossref.org',                     'api',  1000, 50,  3650, true,  'none',    'none',           'https://www.crossref.org/documentation/retrieve-metadata/rest-api/', '2026-11-04', true,  'Verification only. Polite pool with mailto and a user agent.'),
  ('google-books', 'Google Books',           'registry',   'https://www.googleapis.com/books/v1',          'api',  1000, 60,  3650, false, 'snippet', 'none',           'https://developers.google.com/books/terms', '2026-11-04', true,  'Verification only: bibliographic data and whether a phrase exists in print. Never full text.'),
  ('wikidata',     'Wikidata',               'registry',   'https://www.wikidata.org/w/api.php',           'api',  1000, 60,  3650, true,  'none',    'public-figures', 'https://www.wikidata.org/wiki/Wikidata:Data_access', '2026-11-04', true,  'Entity reconciliation: QIDs, life dates, places. CC0.'),
  ('web',          'Publisher pages',        'web',        null,                                           'html', 2000, 20,  0,    false, 'none',    'public-figures', null, '2026-11-04', true,  'The GDELT article pages. Fetched once at detect time, scanned for evidence spans of at most 300 characters, then discarded. retention_days 0: the text is never stored.')
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind, base_url = excluded.base_url, allowed_method = excluded.allowed_method,
  crawl_delay_ms = excluded.crawl_delay_ms, rate_per_min = excluded.rate_per_min, retention_days = excluded.retention_days,
  commercial_reuse = excluded.commercial_reuse, fulltext_storage = excluded.fulltext_storage,
  personal_data_policy = excluded.personal_data_policy, terms_url = excluded.terms_url,
  terms_last_checked = excluded.terms_last_checked, notes = excluded.notes, updated_at = now();

-- One row per fetched source object. Immutable provenance; parsing outputs
-- can be regenerated, the fetch record cannot.
create table if not exists curious_documents (
  id                  uuid primary key default gen_random_uuid(),
  source_id           text not null references curious_sources(id),
  external_id         text not null,              -- the source's own id (LOC item id, GDELT url hash, Europeana id, Gallica ark)
  canonical_url       text not null,
  archive_url         text,                       -- Wayback snapshot when looked up
  title               text,
  publisher           text,
  author              text,
  language            text,
  published_at        timestamptz,
  published_precision text check (published_precision is null or published_precision in ('minute','day','month','year','unknown')),
  retrieved_at        timestamptz not null default now(),
  rights_uri          text,
  content_hash        text,                       -- sha256 of the normalised text, or of the source record when there is no text
  raw_uri             text,                       -- the request URL that produced this row
  extraction_method   text check (extraction_method is null or extraction_method in ('api-json','html-text','ocr-alto','iiif-ocr','pdf-text','sru-xml')),
  text                text,                       -- only when the source policy says 'full' (public domain) or 'snippet'; capped at 40,000 chars
  text_hash           text,
  text_chars          integer,
  ocr_confidence      numeric,
  query               text,                       -- the discovery query that found it
  collector_version   text not null,
  status              text not null default 'fetched' check (status in ('fetched','detected','no-candidates','skipped','failed')),
  detected_at         timestamptz,
  lineage_hint        text,                       -- wire, publisher or collection key the collector could see
  meta                jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (source_id, external_id),
  unique (canonical_url)
);

create index if not exists idx_curious_documents_source_published on curious_documents (source_id, published_at desc);
create index if not exists idx_curious_documents_hash on curious_documents (content_hash);
create index if not exists idx_curious_documents_todo on curious_documents (status) where status = 'fetched';

-- Atomic claims with their evidence span, grade and review state.
create table if not exists curious_claims (
  id                 uuid primary key default gen_random_uuid(),
  text               text not null check (char_length(text) <= 500),
  text_norm          text not null,
  claim_hash         text not null,               -- sha256(text_norm)
  kind               text not null check (kind in ('fact','anecdote','number','quote')),
  subject            text,
  era                text,                        -- curious.json era id
  region             text,                        -- curious.json region id
  theme              text,                        -- curious.json theme id
  year_from          integer,
  year_to            integer,
  place              text,
  country_code       text,
  document_id        uuid not null references curious_documents(id) on delete cascade,
  evidence_quote     text not null check (char_length(evidence_quote) <= 300),
  evidence_start     integer,
  evidence_end       integer,
  evidence_page      integer,
  evidence_media_ts  numeric,
  detector_rules     text[] not null default '{}',
  detector_version   text not null,
  extractor_model    text,
  classifier_version text not null,
  status             text not null default 'candidate' check (status in ('candidate','graded','in_review','approved','rejected','sent_back')),
  grade              text check (grade is null or grade in ('A','B','C','D','E')),
  score              numeric check (score is null or (score >= 0 and score <= 1)),
  score_features     jsonb,
  graded_at          timestamptz,
  flags              text[] not null default '{}', -- contradiction, personal-data, sensitive, anonymous-repetition, circular, translation, time-gap, unverified-popular, sent-back
  cluster_id         uuid,                        -- representative claim of the lexical cluster
  contradicts        uuid references curious_claims(id) on delete set null,
  review_note        text,
  reviewed_by        text,
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (document_id, claim_hash)
);

create index if not exists idx_curious_claims_status_grade on curious_claims (status, grade);
create index if not exists idx_curious_claims_era_theme on curious_claims (era, theme);
create index if not exists idx_curious_claims_cluster on curious_claims (cluster_id);
create index if not exists idx_curious_claims_flags on curious_claims using gin (flags);

-- Every piece of evidence for or against a claim, with its lineage.
create table if not exists curious_claim_sources (
  id                    bigint generated always as identity primary key,
  claim_id              uuid not null references curious_claims(id) on delete cascade,
  document_id           uuid references curious_documents(id) on delete cascade,
  relation              text not null check (relation in ('supports','contradicts','cites','derived_from','mentions')),
  independence_group    text not null,            -- doi:… | isbn:… | quote:… | wire:… | attr:… | pub:…
  is_primary            boolean not null default false,
  is_contemporaneous    boolean not null default false,
  institutional_quality numeric check (institutional_quality is null or (institutional_quality >= 0 and institutional_quality <= 1)),
  quote                 text check (quote is null or char_length(quote) <= 300),
  span_start            integer,
  span_end              integer,
  page                  integer,
  external_ref          text,                     -- doi:… | isbn:… | qid:… | url:…
  verified_by           text not null check (verified_by in ('detector','verify-crossref','verify-books','verify-wikidata','human')),
  created_at            timestamptz not null default now()
);

create unique index if not exists uq_curious_claim_sources
  on curious_claim_sources (claim_id, coalesce(document_id::text, external_ref, ''), relation);
create index if not exists idx_curious_claim_sources_group on curious_claim_sources (independence_group);

create table if not exists curious_entities (
  id                bigint generated always as identity primary key,
  name              text not null,
  name_norm         text not null,
  kind              text not null check (kind in ('person','org','place','work','event','other')),
  wikidata_qid      text,
  aliases           text[] not null default '{}',
  country_code      text,
  lat               double precision,
  lng               double precision,
  sensitive         boolean not null default false,
  is_living_private boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (kind, name_norm)
);
create index if not exists idx_curious_entities_qid on curious_entities (wikidata_qid);

create table if not exists curious_claim_entities (
  claim_id  uuid not null references curious_claims(id) on delete cascade,
  entity_id bigint not null references curious_entities(id) on delete cascade,
  role      text not null default 'mention' check (role in ('subject','object','place','work','mention')),
  primary key (claim_id, entity_id, role)
);

-- What the desk and the composer read: approved claims with their document
-- and the lineage counts the grade rule and the brief quote.
create or replace view curious_claim_pool as
select
  c.id, c.text, c.kind, c.subject, c.era, c.region, c.theme, c.year_from, c.year_to, c.place, c.country_code,
  c.grade, c.score, c.score_features, c.flags, c.evidence_quote, c.evidence_page, c.cluster_id,
  c.reviewed_at as approved_at, c.updated_at,
  d.id as document_id, d.source_id, d.title as document_title, d.publisher, d.author, d.canonical_url, d.archive_url,
  d.published_at, d.published_precision, d.language,
  coalesce(s.n_sources, 0) as n_sources,
  coalesce(s.n_groups, 0) as n_groups,
  coalesce(s.n_primary, 0) as n_primary,
  coalesce(s.n_derived, 0) as n_derived,
  coalesce(s.n_contradicts, 0) as n_contradicts,
  coalesce(e.entities, '{}'::text[]) as entities
from curious_claims c
join curious_documents d on d.id = c.document_id
left join lateral (
  select
    count(*) filter (where cs.relation in ('supports','cites','derived_from')) as n_sources,
    count(distinct cs.independence_group) filter (where cs.relation in ('supports','cites')) as n_groups,
    count(*) filter (where cs.is_primary) as n_primary,
    count(*) filter (where cs.relation = 'derived_from') as n_derived,
    count(*) filter (where cs.relation = 'contradicts') as n_contradicts
  from curious_claim_sources cs where cs.claim_id = c.id
) s on true
left join lateral (
  select array_agg(en.name order by en.name) as entities
  from curious_claim_entities ce join curious_entities en on en.id = ce.entity_id
  where ce.claim_id = c.id
) e on true
where c.status = 'approved';

alter table curious_sources enable row level security;
alter table curious_documents enable row level security;
alter table curious_claims enable row level security;
alter table curious_claim_sources enable row level security;
alter table curious_entities enable row level security;
alter table curious_claim_entities enable row level security;
-- No policies on purpose: service-role only. When a public claims surface
-- ships, the flip is additive:
--   create policy "Public read approved curious claims"
--     on curious_claims for select using (status = 'approved');
