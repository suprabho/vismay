-- Chunk-based TTS storage.
--
-- Replaces the per-unit `story_audio` model. We now batch consecutive mobile
-- units into a single TTS request (one chunk = ~3 min of audio) to stay under
-- Gemini's daily request quota. Per-unit playback cues are stored separately
-- so the autoplay player can drive `activeUnit` from the audio's currentTime.

create table if not exists story_audio_chunks (
  id            bigint generated always as identity primary key,
  slug          text not null,
  chunk_index   integer not null,         -- 0..N-1 in story order
  chunk_hash    text not null,            -- sha256 of joined transcript
  storage_path  text not null,
  public_url    text not null,
  duration_ms   integer not null,         -- total audio duration of the chunk
  created_at    timestamptz default now(),

  unique (slug, chunk_index)
);

create index if not exists idx_story_audio_chunks_slug
  on story_audio_chunks (slug);

create table if not exists story_audio_cues (
  id            bigint generated always as identity primary key,
  slug          text not null,
  unit_index    integer not null,         -- mobile-unit index
  chunk_index   integer not null,         -- which chunk's audio holds this unit
  start_ms      integer not null,         -- offset within the chunk
  end_ms        integer not null,
  created_at    timestamptz default now(),

  unique (slug, unit_index)
);

create index if not exists idx_story_audio_cues_slug
  on story_audio_cues (slug);

create index if not exists idx_story_audio_cues_chunk
  on story_audio_cues (slug, chunk_index);
