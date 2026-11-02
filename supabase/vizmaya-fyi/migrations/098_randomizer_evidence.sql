-- The Evidence Desk: a ninth randomizer, for vizmaya.fyi stories built from
-- one study a day out of an annotated collection of research on social
-- media's effects on people and society (2026 edition, 83 papers and reports
-- in 7 themes): a theme, a design, a study and a lens. Its spins share the
-- log with the other randomizers, so the repeat blocks, re-spins, the hero
-- insight flow and the publish link work the same; only the allowed
-- randomizer ids grow.
--
-- It needs no table of its own: the whole collection is committed
-- (packages/randomizer/src/data/evidence.json, parsed from
-- scripts/randomizer/sources/social-media-research-2026.md by
-- scripts/randomizer/evidence-taxonomy.mts), and the drawn study's citation
-- record is read from OpenAlex per spin
-- (packages/randomizer/src/evidencePool.ts) and kept on the spin.
--
-- Draw and dataset:  packages/randomizer/src/draw.ts, src/data/evidence.json
-- Daily spin:        apps/vizmaya-fyi/app/api/randomizer/cron/evidence (Vercel Cron)
-- Admin UI:          apps/admin/app/vizmaya/(tabbed)/randomizer (the Evidence Desk tab)

alter table randomizer_spins drop constraint if exists randomizer_spins_randomizer_check;
alter table randomizer_spins
  add constraint randomizer_spins_randomizer_check
  check (randomizer in ('desk','atlas','epics','ocw','landmark','hundred','evidence','footshorts','viznba'));
