-- The 100 Desk: an eighth randomizer, for vizmaya.fyi stories built from one
-- person a day out of Michael H. Hart's ranking of the most influential
-- persons in history (The 100, revised edition, 1992): a domain, an era, a
-- person and a lens. Its spins share the log with the other randomizers, so
-- the repeat blocks, re-spins, the hero insight gate and the publish link
-- work the same; only the allowed randomizer ids grow.
--
-- It needs no table of its own: the whole ranking is committed
-- (packages/randomizer/src/data/hundred.json, from
-- scripts/randomizer/hundred-taxonomy.mts), and the drawn person's profile is
-- read from Wikidata, Wikipedia and Wikimedia's pageviews per spin
-- (packages/randomizer/src/hundredPool.ts) and kept on the spin.
--
-- Draw and dataset:  packages/randomizer/src/draw.ts, src/data/hundred.json
-- Daily spin:        apps/vizmaya-fyi/app/api/randomizer/cron/hundred (Vercel Cron)
-- Admin UI:          apps/admin/app/vizmaya/(tabbed)/randomizer (The 100 Desk tab)

alter table randomizer_spins drop constraint if exists randomizer_spins_randomizer_check;
alter table randomizer_spins
  add constraint randomizer_spins_randomizer_check
  check (randomizer in ('desk','atlas','epics','ocw','landmark','hundred','footshorts','viznba'));
