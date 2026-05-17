-- ShortFoot schema v1
-- Run via: supabase db push

-- =====================================================
-- ENTITIES: leagues, teams, players (the follow graph targets)
-- =====================================================

create type entity_type as enum ('league', 'team', 'player');

create table entities (
  id              uuid primary key default gen_random_uuid(),
  type            entity_type not null,
  slug            text not null,                      -- url-safe, e.g. "premier-league", "arsenal", "bukayo-saka"
  name            text not null,                      -- display name
  -- external IDs for cross-referencing stats APIs
  football_data_id   int,                             -- football-data.org id
  api_football_id    int,                             -- api-football id
  -- denormalized context for quick display
  country         text,                               -- for teams/leagues
  league_slug     text,                               -- for teams/players
  team_slug       text,                               -- for players
  crest_url       text,                               -- logo / headshot
  created_at      timestamptz not null default now(),
  unique (type, slug)
);

create index idx_entities_type on entities (type);
create index idx_entities_league_slug on entities (league_slug) where league_slug is not null;
create index idx_entities_team_slug on entities (team_slug) where team_slug is not null;

-- =====================================================
-- ARTICLES: raw ingested items from RSS
-- =====================================================

create table articles (
  id              uuid primary key default gen_random_uuid(),
  url             text not null unique,               -- canonical URL, used for dedupe
  url_hash        text not null unique,               -- sha256 of url, for fast lookup
  publisher       text not null,                      -- e.g. "BBC Sport", "Guardian"
  headline        text not null,
  original_snippet text,                              -- from RSS description
  image_url       text,
  published_at    timestamptz not null,
  ingested_at     timestamptz not null default now(),
  -- summarization output
  summary         text,                               -- 55-60 word Gemini summary
  summary_model   text,                               -- e.g. "gemini-2.5-flash"
  summary_at      timestamptz,
  -- clustering: articles about the same story
  cluster_id      uuid,                               -- groups duplicate stories
  is_cluster_lead boolean not null default false,     -- the "best" article in the cluster
  -- status
  status          text not null default 'pending',    -- pending | summarized | failed | hidden
  failure_reason  text
);

create index idx_articles_published_at on articles (published_at desc);
create index idx_articles_status on articles (status);
create index idx_articles_cluster on articles (cluster_id) where cluster_id is not null;

-- =====================================================
-- ARTICLE_ENTITIES: many-to-many tagging
-- =====================================================

create table article_entities (
  article_id      uuid not null references articles(id) on delete cascade,
  entity_id       uuid not null references entities(id) on delete cascade,
  confidence      real not null default 1.0,          -- Gemini can return confidence; default 1.0 for exact matches
  primary key (article_id, entity_id)
);

create index idx_article_entities_entity on article_entities (entity_id);

-- =====================================================
-- USERS are managed by Supabase Auth (auth.users)
-- We extend via a profiles table
-- =====================================================

create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text,
  onboarded_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- =====================================================
-- FOLLOWS: user → entity
-- =====================================================

create table follows (
  user_id         uuid not null references auth.users(id) on delete cascade,
  entity_id       uuid not null references entities(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (user_id, entity_id)
);

create index idx_follows_user on follows (user_id);
create index idx_follows_entity on follows (entity_id);

-- =====================================================
-- FEED VIEW: articles a user should see
-- Used by the app; also the basis for push notification triggers
-- =====================================================

-- security_invoker makes the view respect RLS on the underlying `follows` table,
-- so each user only sees rows joined to their own follows.
create or replace view user_feed with (security_invoker = true) as
select distinct on (a.cluster_id, a.id)
  a.id              as article_id,
  a.headline,
  a.summary,
  a.image_url,
  a.publisher,
  a.url,
  a.published_at,
  a.cluster_id,
  f.user_id
from articles a
join article_entities ae on ae.article_id = a.id
join follows f on f.entity_id = ae.entity_id
where a.status = 'summarized'
  and (a.is_cluster_lead or a.cluster_id is null)
order by a.cluster_id, a.id, a.published_at desc;

-- =====================================================
-- RLS: users only see/modify their own follows + profile
-- =====================================================

alter table profiles enable row level security;
alter table follows enable row level security;

create policy "profiles: users read own"
  on profiles for select using (auth.uid() = id);
create policy "profiles: users update own"
  on profiles for update using (auth.uid() = id);
create policy "profiles: users insert own"
  on profiles for insert with check (auth.uid() = id);

create policy "follows: users read own"
  on follows for select using (auth.uid() = user_id);
create policy "follows: users insert own"
  on follows for insert with check (auth.uid() = user_id);
create policy "follows: users delete own"
  on follows for delete using (auth.uid() = user_id);

-- Articles + entities are public-read (anyone can browse)
alter table articles enable row level security;
alter table entities enable row level security;
alter table article_entities enable row level security;

create policy "articles: public read" on articles for select using (true);
create policy "entities: public read" on entities for select using (true);
create policy "article_entities: public read" on article_entities for select using (true);

-- Writes to articles/entities are service-role only (worker)
-- No INSERT/UPDATE/DELETE policies = locked down to service_role key
