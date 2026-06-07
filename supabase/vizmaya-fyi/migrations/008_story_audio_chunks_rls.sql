-- RLS for chunked-audio tables (added separately because 007 forgot it).
-- Anon/authenticated roles need to read these from the autoplay player;
-- writes still go through the service role from scripts/generate-audio.ts.

alter table story_audio_chunks enable row level security;
alter table story_audio_cues enable row level security;

create policy "Public read story audio chunks"
  on story_audio_chunks for select
  using (true);

create policy "Public read story audio cues"
  on story_audio_cues for select
  using (true);
