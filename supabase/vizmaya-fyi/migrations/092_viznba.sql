-- VizNBA in admin: register the app and its randomizer.
--
-- 1. The `viznba` row in `apps`, so admin's /viznba section (Pipeline, HTML
--    stories, Randomizer) resolves; the [appSlug] layout 404s on an unknown
--    app. Its HTML stories need no schema change: html_stories.app_slug is
--    free text (migration 085), and packages/html-stories scopes by it.
-- 2. The NBA Desk: a fifth randomizer, for viznba stories (franchises,
--    conferences and their news). Its spins share the log with the others,
--    so the repeat blocks, re-spins and the publish link work the same; only
--    the allowed randomizer ids grow. Like the Football Desk it has no heat
--    table: the draw reads the viznba_ tables (supabase/viznba, in this same
--    project) and ESPN's schedule live, through loadViznbaNews in
--    packages/randomizer/src/spins.ts.
--
-- Draw and dataset:  packages/randomizer/src/draw.ts, src/data/viznba.json
-- Admin UI:          apps/admin/app/[appSlug]/(tabbed)/randomizer (viznba)

insert into apps (slug, name)
values ('viznba', 'VizNBA')
on conflict (slug) do nothing;

alter table randomizer_spins drop constraint if exists randomizer_spins_randomizer_check;
alter table randomizer_spins
  add constraint randomizer_spins_randomizer_check
  check (randomizer in ('desk','atlas','epics','footshorts','viznba'));
