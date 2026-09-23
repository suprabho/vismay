-- 080: Doom v Boom per event, weighted by relevance × impact.
--
-- The daily edition's Doom v Boom reading used to count stories, and Google
-- News gives one row per outlet — so one development reported by three
-- outlets was three votes, and a $1M local fine weighed the same as a
-- hyperscaler cancelling gigawatts. The composer now groups the window's
-- stories into events (deterministically, in dcEditionAssembly.ts) and weighs
-- each event by relevance × impact × coverage.
--
-- The news classifier (scrape-news.ts, v4-events-2026-09) writes four new
-- tags in the same Haiku call:
--   relevance — 1–5, how central the story is to the AI build-out
--   impact    — 1–5, how much the event moves it, whichever way
--   event     — the underlying development in one canonical line, the
--               clustering's cleanest signal ("NJ DEP fines Vineland AI data
--               center $1M")
--   actors    — up to three canonical organisation names
--
-- The events themselves live on the edition in the existing
-- dc_editions.mood_counts jsonb ({boom, doom, neutral, method, stories,
-- weight, events}), so dc_editions needs no change.
--
-- Additive + idempotent. Rows classified before v4 keep nulls and weigh as
-- relevance 3 / impact 3 until re-tagged (scrape with --retag-days N).

alter table dc_news
  add column if not exists relevance smallint
    check (relevance is null or relevance between 1 and 5),
  add column if not exists impact smallint
    check (impact is null or impact between 1 and 5),
  add column if not exists event text,
  add column if not exists actors text[] not null default '{}';

comment on column dc_news.relevance is '1–5: how central the story is to the AI infrastructure build-out (classifier v4)';
comment on column dc_news.impact is '1–5: how much the event moves the build-out, whichever direction (classifier v4)';
comment on column dc_news.event is 'The underlying development in one canonical line, for grouping reports of one event (classifier v4)';
comment on column dc_news.actors is 'Up to three canonical organisation names the story is about (classifier v4)';
