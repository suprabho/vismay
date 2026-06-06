-- Move the FIFA World Cup 2026 epic from vizmaya-fyi to Footshorts.
--
-- The bespoke landing page was ported into apps/footshorts/web (rendered at
-- /editorial/epic/fifa-wc26 via the `landing_component` discriminator), and
-- vizmaya's top-level /fifa-wc26 route was removed. Repointing app_slug hands
-- ownership to Footshorts: it now surfaces in the Footshorts editorial magazine
-- and epic fetch (both scoped to app_slug='footshorts'), and drops off vizmaya's
-- epic surfaces.
--
-- Idempotent. The 'footshorts' app row is guaranteed to exist by migration 043.

update epics
set
  app_slug = 'footshorts',
  landing_component = 'fifa-wc26',
  updated_at = now()
where slug = 'fifa-wc26';
