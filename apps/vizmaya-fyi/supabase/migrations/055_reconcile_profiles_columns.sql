-- Repair public.profiles on databases where the original 054 already ran.
--
-- 054 installs an `on_auth_user_created` trigger that inserts `(id, email)` into
-- public.profiles. But this Supabase project is SHARED with footshorts, whose
-- `20260420000000_init.sql` had already created public.profiles WITHOUT an
-- `email` column. The original 054 used `create table if not exists`, so against
-- the shared DB that create was a no-op and `email`/`role` were never added —
-- every `auth.users` insert then failed the trigger with
-- "Database error saving new user", blocking ALL signups (the admin
-- createAdminUser script / dashboard AND footshorts consumer signup).
--
-- 054 has been made idempotent going forward; this migration repairs any
-- database where the broken 054 already ran. All statements are idempotent, so
-- it is a harmless no-op where 054's columns already exist.

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists role  text not null default 'viewer';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'editor', 'viewer'));

-- Backfill emails for any users created before the column existed. Best-effort:
-- migrations run with an owner role that can read auth.users.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;
