-- Season books: the editorial plan for the one-season-per-book series
-- (vizmaya-data/football-seasons). One row per book, keyed by season slug
-- ("2003-04"). `plan` holds the season's story beats and the flatplan of
-- spreads, each spread's card (headline, chart sketch, stat, body, caption)
-- and its data binding. The design system (grid, type, chart styles, spread
-- templates) is locked in code (apps/admin/lib/seasonBooks/system.ts), not here.
--
-- Admin research and production material only: no consumer access.
-- `revision` is bumped on every save; writers update `where revision = <read>`
-- so two editors can't silently overwrite each other.

create table if not exists public.admin_season_books (
  slug text primary key check (slug ~ '^\d{4}-\d{2}$'),
  season_start integer not null check (season_start between 1990 and 2100),
  title text not null,
  plan jsonb not null default '{"beats": [], "spreads": []}'::jsonb,
  revision integer not null default 1,
  -- Denormalised from `plan` on every save so the series list doesn't read
  -- every plan (sketches make them tens of KB each).
  beat_count integer not null default 0,
  spread_count integer not null default 0,
  carded_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists admin_season_books_season on public.admin_season_books (season_start);

alter table public.admin_season_books enable row level security;
revoke all on public.admin_season_books from public, anon, authenticated;
grant select, insert, update, delete on public.admin_season_books to service_role;
comment on table public.admin_season_books is
  'Season books (football-seasons series): story beats, flatplan and spread cards. Private admin production material only.';
