-- VizF1 schema v2 — add the missing FK on vizf1_drivers.constructor_id.
--
-- 001_init.sql created vizf1_drivers.constructor_id with an index but no FK
-- constraint. PostgREST relies on FK metadata to resolve nested embeds, so
-- queries like:
--
--   from('vizf1_session_results')
--     .select('..., drivers:vizf1_drivers(..., constructors:vizf1_constructors(name))')
--
-- 400'd at the inner `constructors:vizf1_constructors(name)` level. This
-- migration adds the missing constraint so the nested embed resolves.

alter table vizf1_drivers
  add constraint vizf1_drivers_constructor_id_fkey
  foreign key (constructor_id) references vizf1_constructors(constructor_id);

-- Tell PostgREST to reload the schema cache so the new FK is picked up
-- without needing a Supabase restart.
notify pgrst, 'reload schema';
