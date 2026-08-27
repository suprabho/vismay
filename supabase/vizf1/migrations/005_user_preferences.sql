-- VizF1 schema v5: user accounts + preferences (follows).
--
-- First auth-backed pass for vizf1. Mirrors the footshorts `profiles` / `follows`
-- model (see supabase/footshorts/migrations/20260420000000_init.sql) but adapted
-- to vizf1's split entity tables: footshorts has one unified `entities` table
-- (uuid PK) whereas vizf1 keeps drivers and constructors in separate tables with
-- text PKs. So a follow stores a generic (entity_type, entity_id) pair rather
-- than a single FK. `entity_id` is intentionally unconstrained text — it points
-- at vizf1_drivers.driver_id or vizf1_constructors.constructor_id depending on
-- entity_type, and we don't FK to two tables from one column.

-- =====================================================
-- PROFILES
-- =====================================================

create table vizf1_profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text,
  onboarded_at    timestamptz,                       -- marks initial preferences completion
  created_at      timestamptz not null default now()
);

-- =====================================================
-- FOLLOWS (user preferences)
-- =====================================================

create table vizf1_follows (
  user_id         uuid not null references auth.users(id) on delete cascade,
  entity_type     text not null check (entity_type in ('driver', 'constructor')),
  entity_id       text not null,                     -- driver_id or constructor_id
  created_at      timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id)
);

create index idx_vizf1_follows_user on vizf1_follows (user_id);
create index idx_vizf1_follows_entity on vizf1_follows (entity_type, entity_id);

-- =====================================================
-- RLS — users only see/modify their own profile + follows
-- =====================================================

alter table vizf1_profiles enable row level security;
alter table vizf1_follows  enable row level security;

create policy "vizf1_profiles: users read own"
  on vizf1_profiles for select using (auth.uid() = id);
create policy "vizf1_profiles: users update own"
  on vizf1_profiles for update using (auth.uid() = id);
create policy "vizf1_profiles: users insert own"
  on vizf1_profiles for insert with check (auth.uid() = id);

create policy "vizf1_follows: users read own"
  on vizf1_follows for select using (auth.uid() = user_id);
create policy "vizf1_follows: users insert own"
  on vizf1_follows for insert with check (auth.uid() = user_id);
create policy "vizf1_follows: users delete own"
  on vizf1_follows for delete using (auth.uid() = user_id);
