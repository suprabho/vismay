-- Coke Studio Pakistan — publish.
--
-- Migration 046 seeded the epic row as draft + hidden from home because the
-- landing component didn't exist yet. The landing (app/coke-studio/*) ships
-- in the same change as this migration, so flip both flags now.
--
-- Safe to re-run: a no-op once both columns are already at the target values.

update epics
   set status       = 'published',
       show_on_home = true,
       updated_at   = now()
 where slug = 'coke-studio'
   and (status <> 'published' or show_on_home is distinct from true);
