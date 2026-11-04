-- The Curious Desk: an eleventh randomizer, for vizmaya.fyi stories built
-- from one approved claim a day out of the claim pipeline's store
-- (curious_claim_pool, migration 101): an era, a theme, a claim and a lens.
-- Its spins share the log with the other randomizers, so the repeat blocks,
-- re-spins, the hero insight flow (the desk is gated) and the publish link
-- work the same; only the allowed randomizer ids grow.
--
-- It needs no table of its own: the pool is read at spin time from
-- curious_claim_pool and curious_claim_sources (packages/randomizer/src/spins.ts
-- loadCuriousPool), and the drawn claim's Crossref, Google Books, Wikidata
-- and Wayback record is read after the draw (packages/randomizer/src/curiousPool.ts);
-- both are kept on the spin.
--
-- Draw and dataset:  packages/randomizer/src/draw.ts, src/data/curious.json
-- Daily spin:        apps/vizmaya-fyi/app/api/randomizer/cron/curious (Vercel Cron)
-- Admin UI:          apps/admin/app/vizmaya/(tabbed)/randomizer (the Curious Desk tab)
--                    apps/admin/app/vizmaya/(tabbed)/curious (the review queue)

alter table randomizer_spins drop constraint if exists randomizer_spins_randomizer_check;
alter table randomizer_spins
  add constraint randomizer_spins_randomizer_check
  check (randomizer in ('desk','atlas','epics','ocw','landmark','hundred','evidence','frontier','curious','footshorts','viznba'));
