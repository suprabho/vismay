-- Admin user profiles for Supabase Auth.
--
-- Admin sign-in moved from a single shared password to per-user Supabase Auth.
-- `auth.users` holds the credentials; this table mirrors each user with an
-- app-facing `role` so future role-gating has a home. v1 gates on
-- authentication only — any `auth.users` session is treated as admin — so
-- `role` is forward-looking and defaults to 'admin'.

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  role       text not null default 'admin' check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now()
);

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
