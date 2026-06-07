-- Admin user profiles for Supabase Auth.
--
-- Admin sign-in moved from a single shared password to per-user Supabase Auth.
-- `auth.users` holds the credentials; this table mirrors each user with an
-- app-facing `role` so future role-gating has a home.
--
-- This project is SHARED with footshorts (open consumer signup), so the trigger
-- below creates a profile for every auth user — including consumers. The admin
-- boundary therefore gates on an explicit email allowlist (`ADMIN_ALLOWED_EMAILS`,
-- see lib/adminAuth.ts), NOT on this `role`. `role` defaults to the least-
-- privileged value so it's never a stand-in for "is admin"; promote real admins
-- deliberately if/when role-based gating is adopted.
--
-- IMPORTANT: footshorts' `20260420000000_init.sql` ALREADY created
-- `public.profiles` in this shared project with a different shape
-- (id, display_name, onboarded_at, created_at — no `email`/`role`). A plain
-- `create table ... (email, role)` here would no-op against that pre-existing
-- table and the trigger below (which inserts `email`) would fail every
-- auth.users insert with "Database error saving new user". So create only the
-- baseline and add the admin columns with idempotent `alter ... if not exists`,
-- which reconciles both a fresh DB and the footshorts-seeded shared DB.

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists role  text not null default 'viewer';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'editor', 'viewer'));

-- Auto-create a profile whenever a Supabase auth user is created (dashboard,
-- admin API, or the createAdminUser script). `security definer` so the trigger
-- can insert into public.profiles regardless of the caller's role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS: a signed-in user may read their own profile. Server-side admin reads use
-- the service-role key, which bypasses RLS.
alter table public.profiles enable row level security;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read"
  on public.profiles for select
  using (auth.uid() = id);
