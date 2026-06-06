-- Coke Studio Pakistan — lyrics cache.
--
-- Fetched by scripts/coke-studio/fetch-lyrics.ts (Genius API search +
-- page-HTML scrape) and consumed by scripts/coke-studio/extract-places.ts
-- (Claude Sonnet 4.6 → coke_studio_place_mentions + gazetteer additions).
--
-- Lyrics are copyrighted: this table has RLS enabled with no SELECT policy,
-- so only the service-role key can read. The extracted snippets that surface
-- to the public landing live in coke_studio_place_mentions.lyric_context /
-- .lyric_translation — those are fair-use-sized quotations.

create table if not exists coke_studio_song_lyrics (
  song_id        text primary key references coke_studio_songs(song_id) on delete cascade,
  source         text not null check (source in ('genius', 'youtube', 'manual')),
  source_url     text not null,
  source_id      text,
  raw_text       text not null,
  script_hint    text check (script_hint is null or script_hint in ('arabic','latin','devanagari','mixed')),
  language_hint  text,
  fetched_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index if not exists idx_coke_studio_song_lyrics_source
  on coke_studio_song_lyrics(source);

-- RLS on, no policies → service-role only. Intentional.
alter table coke_studio_song_lyrics enable row level security;
