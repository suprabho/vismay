-- Narration scripts for HTML stories' section audio (migration 097).
--
-- By default the voice reads each section's on-screen text
-- (packages/html-stories/src/narration.ts). A script, written in the admin
-- editor's Section audio panel, gives a section its own spoken words instead;
-- sections with no line in the script still read their text. The generator
-- (packages/html-stories/src/audioGenerate.ts) reads this row when it runs.
--
-- `sections` is a JSON array, one entry per scripted section:
--   { index, label, text }
-- `index` is the section's position in the page's section list; `label` is
-- what that section was called when the line was written (to flag a script
-- that no longer lines up after the page changed) and isn't read aloud.
--
-- html_story_audio.script_hash records the script a manifest was voiced
-- from, so the editor shows when the audio is behind the script.
--
-- Service-role only (RLS on, no policies), like html_stories.

create table if not exists html_story_scripts (
  slug        text primary key references html_stories(slug) on delete cascade on update cascade,
  sections    jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table html_story_scripts enable row level security;

alter table html_story_audio add column if not exists script_hash text;

notify pgrst, 'reload schema';
