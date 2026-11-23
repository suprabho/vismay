-- Ledger: a twelfth randomizer, for vizmaya.fyi stories built from one past
-- financial crime at a time, researched as an autopsy (how it worked, the
-- signals that were missed, the loophole, the cost): an era, a sector, a
-- typology, a case and a lens. Its spins share the log with the other
-- randomizers, so the repeat blocks, re-spins, the hero insight flow (Ledger
-- is gated) and the publish link work the same; only the allowed randomizer
-- ids grow.
--
-- It needs no table of its own: the whole catalogue is committed
-- (packages/randomizer/src/data/ledger.json) and nothing is read live.
--
-- Draw and dataset:  packages/randomizer/src/draw.ts, src/data/ledger.json
-- Admin UI:          apps/admin/app/vizmaya/(tabbed)/randomizer (the Ledger tab)

alter table randomizer_spins drop constraint if exists randomizer_spins_randomizer_check;
alter table randomizer_spins
  add constraint randomizer_spins_randomizer_check
  check (randomizer in ('desk','atlas','epics','ledger','ocw','landmark','hundred','evidence','frontier','curious','footshorts','viznba'));
