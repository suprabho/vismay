-- The Frontier Desk: a tenth randomizer, for vizmaya.fyi stories built from
-- one arXiv paper a day out of the papers AI Daily's papers job keeps
-- (dc_papers, migration 078): an area, a window (this week, this month, the
-- back catalogue), a paper and a lens. Its spins share the log with the
-- other randomizers, so the repeat blocks, re-spins, the hero insight flow
-- and the publish link work the same; only the allowed randomizer ids grow.
--
-- It needs no table of its own: the pool is read at spin time from
-- dc_papers (relevant = true, the last 365 days) and the published
-- dc_editions' paper_ids (packages/randomizer/src/spins.ts
-- loadFrontierPool), and the drawn paper's arXiv and OpenAlex record is
-- read after the draw (packages/randomizer/src/frontierPool.ts); both are
-- kept on the spin.
--
-- Draw and dataset:  packages/randomizer/src/draw.ts, src/data/frontier.json
-- Daily spin:        apps/vizmaya-fyi/app/api/randomizer/cron/frontier (Vercel Cron)
-- Admin UI:          apps/admin/app/vizmaya/(tabbed)/randomizer (the Frontier Desk tab)

alter table randomizer_spins drop constraint if exists randomizer_spins_randomizer_check;
alter table randomizer_spins
  add constraint randomizer_spins_randomizer_check
  check (randomizer in ('desk','atlas','epics','ocw','landmark','hundred','evidence','frontier','footshorts','viznba'));
