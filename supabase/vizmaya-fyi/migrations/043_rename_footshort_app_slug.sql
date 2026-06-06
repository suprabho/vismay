-- Rename the football app's slug 'footshort' → 'footshorts'.
--
-- Migration 039 originally seeded apps/stories/epics with app_slug='footshort'.
-- The "Footshorts everywhere" rename (793194a) settled on the trailing-s slug
-- and switched the client query filter to 'footshorts', but the live rows are
-- still tagged 'footshort' — so the Editorial feed matches nothing and shows
-- "No stories yet". This repoints the data to the new slug.
--
-- FK-safe ordering: create the new parent row, repoint children, drop the old
-- parent. Idempotent — on a fresh DB (which seeds 'footshorts' directly) every
-- statement is a no-op.

insert into apps (slug, name)
values ('footshorts', 'Footshorts')
on conflict (slug) do nothing;

update stories set app_slug = 'footshorts' where app_slug = 'footshort';
update epics   set app_slug = 'footshorts' where app_slug = 'footshort';

delete from apps where slug = 'footshort';
