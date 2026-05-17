-- Story audio metadata table
-- Tracks generated TTS audio files stored in Supabase Storage

create table if not exists story_audio (
  id            bigint generated always as identity primary key,
  slug          text not null,
  unit_index    integer not null,
  content_hash  text not null,
  storage_path  text not null,
  public_url    text not null,
  created_at    timestamptz default now(),

  unique (slug, unit_index)
);

-- Index for fast lookups by story slug
create index if not exists idx_story_audio_slug on story_audio (slug);

-- Create a public storage bucket for audio files
insert into storage.buckets (id, name, public)
values ('story-audio', 'story-audio', true)
on conflict (id) do nothing;

-- Allow public read access to audio files
create policy "Public read access for story audio"
  on storage.objects for select
  using (bucket_id = 'story-audio');

-- Allow service role to upload/delete audio files
create policy "Service role upload for story audio"
  on storage.objects for insert
  with check (bucket_id = 'story-audio');

create policy "Service role delete for story audio"
  on storage.objects for delete
  using (bucket_id = 'story-audio');
