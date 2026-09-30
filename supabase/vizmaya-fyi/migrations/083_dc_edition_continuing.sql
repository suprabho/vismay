-- 083: "Still developing" — threads carried over from earlier editions.
--
-- Google News keeps surfacing a development for days as more outlets file on
-- it, so two consecutive windows can share no story and still lead with the
-- same news (Samsung's $1B Helix stake led both 2026-09-29 and 2026-09-30).
-- The composer now clusters the window against the last few editions' stories
-- (the Doom v Boom event matching, dcEditionAssembly.ts findCarryOvers): a
-- carried-over development may not lead the headline, deck or key notes unless
-- it adds something new, and it is listed under Key notes as "Still
-- developing" instead — one line per thread on what this window added, with
-- a link back to the edition that first carried it.
--
-- Additive + idempotent. The published-row guard (078) covers this column
-- too. Reads fall back to the old column list until this is applied, so the
-- code can ship first (editions then render without the block).

alter table dc_editions
  add column if not exists continuing jsonb not null default '[]'::jsonb;

comment on column dc_editions.continuing is
  'Threads carried over from earlier editions: [{label, text, since (edition date), sources:[{name, url}]}]';
