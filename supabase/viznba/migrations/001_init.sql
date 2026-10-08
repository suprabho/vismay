-- VizNBA schema v1 — news ingestion + entity tagging.
-- All tables and enums are namespaced with `viznba_` so they can co-exist in
-- the project-wide Supabase project alongside vizmaya, vizf1 and footshorts.

-- =====================================================
-- TEAMS — the 30 franchises, seeded from ESPN's public site API
-- (apps/viznba/worker/src/seedRoster.ts)
-- =====================================================

create table viznba_teams (
  team_id           text primary key,                   -- ESPN abbreviation lowercased, e.g. "lal"
  espn_id           text not null unique,               -- ESPN team id, e.g. "13"
  abbreviation      text not null,                      -- "LAL"
  location          text not null,                      -- "Los Angeles"
  name              text not null,                      -- "Lakers"
  display_name      text not null,                      -- "Los Angeles Lakers"
  primary_color     text,                               -- hex without '#', from ESPN
  secondary_color   text,
  logo_url          text,
  -- extra surface forms the resolver should accept ("Sixers", "Cavs", "OKC")
  aliases           text[] not null default '{}',
  updated_at        timestamptz not null default now()
);

-- =====================================================
-- PLAYERS — current rosters, re-seeded weekly so trades move players
-- =====================================================

create table viznba_players (
  player_id         text primary key,                   -- ESPN athlete id
  first_name        text not null,
  last_name         text not null,
  display_name      text not null,                      -- "LeBron James"
  team_id           text references viznba_teams(team_id) on delete set null,
  jersey            text,
  position          text,                               -- "G", "F", "C", "G-F"…
  headshot_url      text,
  date_of_birth     date,
  aliases           text[] not null default '{}',       -- "KD", "SGA", "Wemby"
  -- false once a player drops off every roster (waived, retired, overseas).
  -- Kept rather than deleted so old article tags stay resolvable.
  active            boolean not null default true,
  updated_at        timestamptz not null default now()
);

create index idx_viznba_players_team on viznba_players (team_id);

-- =====================================================
-- COACHES — head coaches; hirings and firings are a big share of NBA news
-- =====================================================

create table viznba_coaches (
  coach_id          text primary key,                   -- ESPN coach id
  first_name        text not null,
  last_name         text not null,
  display_name      text not null,
  team_id           text references viznba_teams(team_id) on delete set null,
  aliases           text[] not null default '{}',
  active            boolean not null default true,
  updated_at        timestamptz not null default now()
);

-- =====================================================
-- ARTICLES — RSS-ingested, Jev-classified, Claude-summarised NBA news
-- =====================================================

create table viznba_articles (
  id                uuid primary key default gen_random_uuid(),
  url               text not null unique,
  url_hash          text not null unique,               -- sha256 of url
  source_id         text not null,                      -- sources.ts id, e.g. "espn-nba"
  publisher         text not null,
  headline          text not null,
  original_snippet  text,
  image_url         text,
  published_at      timestamptz not null,
  ingested_at       timestamptz not null default now(),
  -- summarisation
  summary           text,
  summary_model     text,
  summary_at        timestamptz,
  -- status: pending | summarized | hidden (not NBA) | failed
  status            text not null default 'pending',
  failure_reason    text,
  -- game | transaction | injury | draft | front_office | league | analysis | off_court
  -- (NBA news) or other_basketball | other_sport | betting_fantasy | unrelated (hidden)
  topic_category    text
);

create index idx_viznba_articles_published_at on viznba_articles (published_at desc);
create index idx_viznba_articles_status on viznba_articles (status);
create index idx_viznba_articles_topic on viznba_articles (topic_category);

-- =====================================================
-- ARTICLE → ENTITY tagging (polymorphic)
-- =====================================================

create type viznba_article_entity_type as enum ('team', 'player', 'coach');

create table viznba_article_entities (
  article_id        uuid not null references viznba_articles(id) on delete cascade,
  entity_type       viznba_article_entity_type not null,
  entity_id         text not null,                      -- team_id / player_id / coach_id
  -- Jev's probability that the entity is a real subject of the article
  -- (jevEntityGate.ts); 1.0 when the gate is off or failed open.
  confidence        real not null default 1.0,
  primary key (article_id, entity_type, entity_id)
);

create index idx_viznba_article_entities_entity on viznba_article_entities (entity_type, entity_id);

-- =====================================================
-- RLS — public read, service-role writes
-- =====================================================

alter table viznba_teams            enable row level security;
alter table viznba_players          enable row level security;
alter table viznba_coaches          enable row level security;
alter table viznba_articles         enable row level security;
alter table viznba_article_entities enable row level security;

create policy "viznba_teams: public read"            on viznba_teams            for select using (true);
create policy "viznba_players: public read"          on viznba_players          for select using (true);
create policy "viznba_coaches: public read"          on viznba_coaches          for select using (true);
create policy "viznba_articles: public read"         on viznba_articles         for select using (status = 'summarized');
create policy "viznba_article_entities: public read" on viznba_article_entities for select using (true);
