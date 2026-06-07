-- Enable pgvector for semantic search
create extension if not exists vector;

-- Raw documents downloaded from source URLs
create table if not exists epstein_documents (
  id          uuid primary key default gen_random_uuid(),
  source      text not null check (source in ('doj', 'fbi', 'house_oversight')),
  source_url  text not null unique,
  filename    text,
  file_type   text check (file_type in ('pdf', 'image', 'html', 'video')),
  page_count  int,
  raw_text    text,
  status      text not null default 'pending'
              check (status in ('pending', 'downloading', 'extracted', 'chunked', 'ner_done', 'failed')),
  error       text,
  downloaded_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_epstein_documents_source on epstein_documents(source);
create index if not exists idx_epstein_documents_status on epstein_documents(status);

-- 2,000-token chunks of each document
create table if not exists epstein_chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references epstein_documents(id) on delete cascade,
  chunk_index  int not null,
  text         text not null,
  token_count  int,
  content_hash text not null unique,  -- sha256 of text, for NER cache
  embedding    vector(1536),          -- text-embedding-3-small compatible
  ner_done     boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists idx_epstein_chunks_doc on epstein_chunks(document_id);
create index if not exists idx_epstein_chunks_ner  on epstein_chunks(ner_done);

-- Extracted locations
create table if not exists epstein_locations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  canonical_name text,                -- after deduplication
  lat            float,
  lng            float,
  geocoded       boolean not null default false,
  mention_count  int not null default 0,
  created_at     timestamptz not null default now(),
  unique (name)
);

-- Extracted people
create table if not exists epstein_people (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  role                text,
  associated_location text,           -- resolved country/region
  mention_count       int not null default 0,
  wikidata_id         text,
  created_at          timestamptz not null default now(),
  unique (name)
);

-- Extracted events
create table if not exists epstein_events (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  event_date    text,                 -- flexible string, e.g. "2008", "March 2006"
  location_name text,
  location_id   uuid references epstein_locations(id),
  mention_count int not null default 0,
  created_at    timestamptz not null default now(),
  unique (name)
);

-- Junction: which chunk mentioned which entity
create table if not exists epstein_mentions (
  id          uuid primary key default gen_random_uuid(),
  chunk_id    uuid not null references epstein_chunks(id) on delete cascade,
  entity_type text not null check (entity_type in ('location', 'person', 'event')),
  entity_id   uuid not null,
  context     text,                   -- surrounding sentence(s) from the chunk
  mentioned_by text,                  -- person who mentioned it (if extractable)
  created_at  timestamptz not null default now()
);

create index if not exists idx_epstein_mentions_chunk  on epstein_mentions(chunk_id);
create index if not exists idx_epstein_mentions_entity on epstein_mentions(entity_type, entity_id);

-- Substory clusters (populated after graph community detection)
create table if not exists epstein_substories (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  summary     text,
  doc_count   int not null default 0,
  people      text[] not null default '{}',
  locations   text[] not null default '{}',
  events      text[] not null default '{}',
  created_at  timestamptz not null default now()
);

-- RPC: semantic nearest-neighbour search on chunks
create or replace function match_epstein_chunks(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count     int   default 10
)
returns table (
  id          uuid,
  document_id uuid,
  text        text,
  similarity  float
)
language sql stable as $$
  select
    id, document_id, text,
    1 - (embedding <=> query_embedding) as similarity
  from epstein_chunks
  where embedding is not null
    and 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;
