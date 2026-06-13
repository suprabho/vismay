-- Evergreen pillar fields for epics. Each epic landing (/epstein,
-- /energy-profile, /coke-studio) gets an optional "X, Explained" narrative plus
-- key-takeaways bullets, rendered server-side by EpicSeoBlock so the topic hub
-- competes for explainer/reference queries and exposes crawlable text + links
-- above its interactive map/grid.
--
-- Additive + idempotent. `explainer` is markdown; `takeaways`/`keywords` are
-- jsonb string arrays. date_published/date_modified feed the epic Article
-- JSON-LD (the interactive landings predate this, so both are nullable).

alter table epics add column if not exists explainer       text;
alter table epics add column if not exists takeaways       jsonb not null default '[]'::jsonb;
alter table epics add column if not exists keywords        jsonb not null default '[]'::jsonb;
alter table epics add column if not exists date_published  timestamptz;
alter table epics add column if not exists date_modified   timestamptz;
