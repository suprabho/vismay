-- Seed the Epstein epic row so /admin/epics/epstein can load theme overrides
-- and /epstein can read the row in getEpic('epstein'). The /epstein public
-- page already falls back to default theme when the row is missing, but the
-- admin theme editor (added in commit f889b7a) returns 404 without it.
--
-- landing_component is metadata only; nothing currently switches on its value
-- (the /epstein route is hand-built, not picked by discriminator).
insert into epics (slug, name, description, landing_component)
  values (
    'epstein',
    'Epstein',
    'An interactive map of Jeffrey Epstein''s private flights, the people who flew on them, and the addresses in his black book.',
    'epstein-map'
  )
  on conflict (slug) do nothing;
