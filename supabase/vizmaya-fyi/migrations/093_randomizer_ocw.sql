-- The OCW Desk: a sixth randomizer, for vizmaya.fyi stories built from one
-- MIT OpenCourseWare resource a day (a field, a topic, a resource kind, a
-- course, a resource and a lens). Its spins share the log with the other
-- randomizers, so the repeat blocks, re-spins and the publish link work the
-- same; only the allowed randomizer ids grow.
--
-- It needs no heat table: the draw reads MIT Learn's public API live
-- (packages/randomizer/src/ocwPool.ts), and the taxonomy it plans from is
-- committed (src/data/ocw.json, scripts/randomizer/ocw-taxonomy.mts).
--
-- Draw and dataset:  packages/randomizer/src/draw.ts, src/data/ocw.json
-- Daily spin:        apps/vizmaya-fyi/app/api/randomizer/cron/ocw (Vercel Cron)
-- Admin UI:          apps/admin/app/vizmaya/(tabbed)/randomizer (the OCW Desk tab)

alter table randomizer_spins drop constraint if exists randomizer_spins_randomizer_check;
alter table randomizer_spins
  add constraint randomizer_spins_randomizer_check
  check (randomizer in ('desk','atlas','epics','ocw','footshorts','viznba'));
