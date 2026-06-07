-- Per-story TTS narration override.
--
-- The audio generation script (scripts/generate-audio.ts) computes default
-- narration text from each mobile unit's heading + paragraphs. This column
-- holds an opaque YAML blob that lets the admin Narration tab override the
-- spoken text per unit without touching the displayed markdown.
--
-- Schema (parsed by lib/storyTts.ts):
--
--   units:
--     - unit: { parentIndex: 1, subIndex: 0, sliceIndex: 0 }
--       script: "Custom narration for this unit."
--
-- Unit identity is `(parentIndex, subIndex, sliceIndex)` so an override
-- survives mobileParagraphs slice tweaks as long as the unit position is
-- stable. Edits change the chunk transcript hash, so the next audio render
-- regenerates only the affected chunk.

alter table stories
  add column if not exists tts_yaml text;
