-- Coke Studio Pakistan epic. 15 seasons (S1–S15) of the Wikipedia "List of
-- Coke Studio Pakistan episodes" plus a hand-seeded gazetteer of the places
-- the lyrics canonically reach for (Lahore, Multan, Sindh, …). Header-only
-- ingest tables for song_languages and place_mentions go in alongside so the
-- enrichment passes (Zahra Sabri's language compilation, gazetteer-matched
-- LLM extraction) have somewhere to write without another migration.
--
-- Source corpus + ingest notes: vizmaya-data/coke-studio/{README,INGEST_NOTES}.md
-- Importer: apps/vizmaya-fyi/scripts/coke-studio/import.ts (pnpm coke-studio:import).
--
-- The epic row is seeded as draft + hidden from the home grid — the landing
-- component (coke-studio-map) isn't built yet. Flipping status='published'
-- and show_on_home=true once the page lands.

-- Songs: one row per Coke Studio track, 352 rows in the seed CSV.
-- song_id format: cs_s{NN}_e{NN}_t{NN}. Season-openers use e00 with `episode`
-- left NULL (per INGEST_NOTES gotcha 2). lyricists/composers/duration/youtube
-- intentionally empty in the seed — future enrichment passes fill them.
--
-- artists/lyricists/composers stored as plain text rather than text[] because
-- the source page mixes pipe, comma, and ampersand separators where some
-- groupings are intentional band names ("Zeb & Haniya"); see INGEST_NOTES
-- gotcha 5. A later normalization pass can migrate to arrays.
create table if not exists coke_studio_songs (
  song_id            text primary key,
  title              text not null,
  title_native       text,
  season             int not null check (season between 1 and 99),
  episode            int check (episode is null or episode between 1 and 99),
  track_in_episode   int not null check (track_in_episode between 1 and 99),
  release_date       date,
  duration_seconds   int check (duration_seconds is null or duration_seconds > 0),
  artists            text,
  lyricists          text,
  composers          text,
  producer           text,
  youtube_url        text,
  is_instrumental    boolean not null default false,
  is_cover           boolean not null default false,
  original_artist    text,
  notes              text,
  updated_at         timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

create index if not exists idx_coke_studio_songs_season
  on coke_studio_songs(season);
create index if not exists idx_coke_studio_songs_season_episode
  on coke_studio_songs(season, episode, track_in_episode);
create index if not exists idx_coke_studio_songs_producer
  on coke_studio_songs(producer);

alter table coke_studio_songs enable row level security;

create policy "Public read coke_studio_songs"
  on coke_studio_songs for select
  using (true);

-- Gazetteer: canonical places named in the lyric corpus. Hand-seeded with the
-- Pakistan + qawwali-tradition starter set (33 rows in the seed CSV).
-- place_canonical is the natural key — the readable English spelling used as
-- the canonical form in place_mentions.
--
-- Created before place_mentions so the FK below resolves on first apply.
create table if not exists coke_studio_gazetteer (
  place_canonical    text primary key,
  place_type         text not null
                     check (place_type in ('city','region','province','country','river','mountain','desert','shrine','historical')),
  modern_country     text check (modern_country is null or length(modern_country) = 2),
  historical_polity  text,
  lat                double precision not null,
  lon                double precision not null,
  aliases            text,
  notes              text,
  updated_at         timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

create index if not exists idx_coke_studio_gazetteer_country
  on coke_studio_gazetteer(modern_country);
create index if not exists idx_coke_studio_gazetteer_type
  on coke_studio_gazetteer(place_type);

alter table coke_studio_gazetteer enable row level security;

create policy "Public read coke_studio_gazetteer"
  on coke_studio_gazetteer for select
  using (true);

-- Song languages: many-to-many between songs and the languages they're sung
-- in. share_estimate is the rough 0..1 fraction of the song in that language
-- (useful for ranking primary vs. secondary). Header-only on first apply —
-- gets backfilled from Zahra Sabri's compilation + a fasttext pass.
create table if not exists coke_studio_song_languages (
  song_id          text not null references coke_studio_songs(song_id) on delete cascade,
  language         text not null,
  language_family  text,
  script           text,
  share_estimate   double precision check (share_estimate is null or (share_estimate >= 0 and share_estimate <= 1)),
  role             text check (role is null or role in ('primary','secondary','refrain','outro','interlude')),
  verse_locations  text,
  confidence       text not null default 'medium' check (confidence in ('low','medium','high')),
  source           text,
  notes            text,
  updated_at       timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  primary key (song_id, language)
);

create index if not exists idx_coke_studio_song_languages_language
  on coke_studio_song_languages(language);

alter table coke_studio_song_languages enable row level security;

create policy "Public read coke_studio_song_languages"
  on coke_studio_song_languages for select
  using (true);

-- Place mentions: every place named in a song's lyric, normalised to a
-- gazetteer entry. mention_id is opaque — the importer assigns it (see
-- README idempotency rules). Header-only on first apply.
create table if not exists coke_studio_place_mentions (
  mention_id           text primary key,
  song_id              text not null references coke_studio_songs(song_id) on delete cascade,
  place_raw            text,
  place_canonical      text not null references coke_studio_gazetteer(place_canonical) on update cascade,
  language_of_mention  text,
  lyric_context        text,
  lyric_translation    text,
  context_type         text check (context_type is null or context_type in ('beloved','origin','journey','shrine','imagery','address','other')),
  verse_number         int check (verse_number is null or verse_number > 0),
  confidence           text not null default 'medium' check (confidence in ('low','medium','high')),
  notes                text,
  updated_at           timestamptz not null default now(),
  created_at           timestamptz not null default now()
);

create index if not exists idx_coke_studio_place_mentions_song
  on coke_studio_place_mentions(song_id);
create index if not exists idx_coke_studio_place_mentions_place
  on coke_studio_place_mentions(place_canonical);

alter table coke_studio_place_mentions enable row level security;

create policy "Public read coke_studio_place_mentions"
  on coke_studio_place_mentions for select
  using (true);

-- Seed the epic row. Draft + hidden from home until the landing component
-- (coke-studio-map) ships. The on-conflict-do-update keeps the seed authoritative
-- if the migration re-runs against an environment where someone created the row.
insert into epics (slug, name, description, landing_component, status, app_slug, show_on_home)
  values (
    'coke-studio',
    'Coke Studio Pakistan',
    'Fifteen seasons of Coke Studio Pakistan — songs, languages, and the places the lyrics keep coming home to.',
    'coke-studio-map',
    'draft',
    'vizmaya-fyi',
    false
  )
  on conflict (slug) do update set
    name              = excluded.name,
    description       = excluded.description,
    landing_component = excluded.landing_component,
    status            = excluded.status,
    app_slug          = excluded.app_slug,
    show_on_home      = excluded.show_on_home,
    updated_at        = now();
