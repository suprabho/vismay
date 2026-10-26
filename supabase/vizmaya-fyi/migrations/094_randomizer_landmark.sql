-- The Landmark Desk: a seventh randomizer, for vizmaya.fyi stories built from
-- one piece of prize-winning research a day (a field, a prize, an era, a
-- laureate, the paper or book the award rewarded, and a lens). Its spins
-- share the log with the other randomizers, so the repeat blocks, re-spins
-- and the publish link work the same; only the allowed randomizer ids grow.
--
-- It needs no heat table: the draw reads the Nobel Prize API and Wikidata
-- for the awards and Wikidata, OpenAlex, Open Library and Unpaywall for the
-- works, live (packages/randomizer/src/landmarkPool.ts), and the taxonomy it
-- plans from is committed (src/data/landmark.json,
-- scripts/randomizer/landmark-taxonomy.mts).
--
-- Draw and dataset:  packages/randomizer/src/draw.ts, src/data/landmark.json
-- Daily spin:        apps/vizmaya-fyi/app/api/randomizer/cron/landmark (Vercel Cron)
-- Admin UI:          apps/admin/app/vizmaya/(tabbed)/randomizer (the Landmark Desk tab)

alter table randomizer_spins drop constraint if exists randomizer_spins_randomizer_check;
alter table randomizer_spins
  add constraint randomizer_spins_randomizer_check
  check (randomizer in ('desk','atlas','epics','ocw','landmark','footshorts','viznba'));
