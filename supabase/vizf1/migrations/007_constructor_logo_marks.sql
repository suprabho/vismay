-- Constructor logos: switch to the bundled 2026 white marks.
--
-- The web app now ships single-colour team marks at
-- apps/vizf1/web/public/constructors/<id>.avif (48x48, transparent), so the
-- UI no longer depends on Wikimedia for team logos. Paths are
-- root-relative and resolve against the app origin; the UI renders them on a
-- team-tinted dark chip (see apps/vizf1/web/components/TeamBadge.tsx).
--
-- Both slug spellings OpenF1 has used are covered where they differ (e.g.
-- 'haas' and 'haas_f1_team'). Racing Bulls use the bulls emblem shared with
-- the senior team. Audi and Cadillac rows are created by the worker on first
-- ingest with logo_url read from @vizf1/brand, so they only need refreshing
-- here if they already exist.
--
-- Worker also writes from @vizf1/brand on every upsert, so future ingests stay
-- in sync without further migrations. Idempotent; safe to re-run.

update vizf1_constructors set logo_url = '/constructors/red_bull_racing.avif' where constructor_id in ('red_bull_racing', 'red_bull');
update vizf1_constructors set logo_url = '/constructors/ferrari.avif'         where constructor_id = 'ferrari';
update vizf1_constructors set logo_url = '/constructors/mercedes.avif'        where constructor_id = 'mercedes';
update vizf1_constructors set logo_url = '/constructors/mclaren.avif'         where constructor_id = 'mclaren';
update vizf1_constructors set logo_url = '/constructors/aston_martin.avif'    where constructor_id = 'aston_martin';
update vizf1_constructors set logo_url = '/constructors/williams.avif'        where constructor_id = 'williams';
update vizf1_constructors set logo_url = '/constructors/alpine.avif'          where constructor_id = 'alpine';
update vizf1_constructors set logo_url = '/constructors/racing_bulls.avif'    where constructor_id in ('rb', 'racing_bulls');
update vizf1_constructors set logo_url = '/constructors/haas.avif'            where constructor_id in ('haas', 'haas_f1_team');
update vizf1_constructors set logo_url = '/constructors/audi.avif'            where constructor_id = 'audi';
update vizf1_constructors set logo_url = '/constructors/cadillac.avif'        where constructor_id = 'cadillac';
