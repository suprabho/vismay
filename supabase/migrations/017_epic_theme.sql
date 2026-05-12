-- Theme overrides per epic. Stored as jsonb so each epic can persist its own
-- palette keys without a schema change. The Epstein landing component reads
-- `theme` and merges it with the hardcoded defaults in app/epstein/theme.ts.
--
-- Shape (current): { ink, surface, elevated, bone, muted, line, ember, steel,
-- rose, signal }. Keys are optional — anything missing falls back to defaults.

alter table epics
  add column if not exists theme jsonb not null default '{}'::jsonb;
