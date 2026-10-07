-- The Football Desk: a fourth randomizer, for footshorts stories (teams,
-- tournaments and their news). Its spins share the log with the Vizmaya
-- randomizers, so the repeat blocks, re-spins and the publish link work the
-- same; only the allowed randomizer ids grow.
--
-- It needs no heat table: the draw reads the footshorts feed live (fixtures,
-- entities, articles and article_entities, in this same project) through
-- loadFootshortsNews in packages/randomizer/src/spins.ts.
--
-- Draw and dataset:  packages/randomizer/src/draw.ts, src/data/footshorts.json
-- Admin UI:          apps/admin/app/[appSlug]/(tabbed)/randomizer (footshorts)

alter table randomizer_spins drop constraint if exists randomizer_spins_randomizer_check;
alter table randomizer_spins
  add constraint randomizer_spins_randomizer_check
  check (randomizer in ('desk','atlas','epics','footshorts'));
