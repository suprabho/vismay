-- Add dominant color extracted from crest_url, computed in worker.
-- Stored as a 7-char hex string (e.g. "#EF0107").
alter table entities
  add column if not exists primary_color text;
