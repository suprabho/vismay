-- JSON-native section config for new verticals.
--
-- Stories carry their section config in one of two artifacts, never both:
--
--   • config_yaml — the legacy format every vizmaya-fyi story uses. The compose
--     pipeline hand-builds it as YAML and the canvas edits it via line surgery.
--   • config_json — new verticals (f1, footshorts) are JSON-native: the compose
--     pipeline writes a structured object (no inline-YAML string assembly) and
--     the canvas edits the parsed tree.
--
-- The discriminator is presence: a non-null config_json means the story is
-- JSON-native; otherwise it falls back to config_yaml. Because JSON is a subset
-- of YAML, every existing parseYaml-based reader keeps working when handed the
-- JSON text, so this column is purely additive — no backfill, no reader change
-- for legacy stories. See packages/content-source/src/contentSource.ts.

alter table stories
  add column if not exists config_json text;
