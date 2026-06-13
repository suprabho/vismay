-- Authors registry — the E-E-A-T entity layer. Stories reference authors by
-- slug from their markdown frontmatter (`authors: [...]`), so cluster
-- membership works in both fs and db content modes; this table holds the
-- structured *profile* (name, role, bio, socials) that backs the /authors/<slug>
-- pages and the Person/ProfilePage JSON-LD.
--
-- Standalone table — deliberately does NOT touch public.profiles, which is
-- shared across footshorts/vizmaya-fyi/admin and whose shape is fragile.
--
-- Read helpers: packages/content-source/src/authors.ts
-- Public read via the anon key (author pages render server-side with the
-- service client, but a public-read policy keeps the table queryable from the
-- browser client too and matches the other content tables).

create table if not exists authors (
  slug         text primary key,
  name         text not null,
  role         text,                 -- e.g. "Senior data journalist"
  bio          text,                 -- credentials / E-E-A-T body copy
  avatar_url   text,
  profile_url  text,                 -- canonical profile (defaults to /authors/<slug> in app)
  same_as      jsonb not null default '[]'::jsonb,  -- socials for Person.sameAs
  app_slug     text not null default 'vizmaya-fyi',
  status       text not null default 'published' check (status in ('draft','published','archived')),
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists idx_authors_app_slug on authors(app_slug);
create index if not exists idx_authors_status on authors(status);

alter table authors enable row level security;

-- Idempotent policy create (Postgres has no `create policy if not exists`).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'authors' and policyname = 'Public read authors'
  ) then
    create policy "Public read authors"
      on authors for select
      using (true);
  end if;
end $$;

-- Seed the existing "vizmaya desk" identity so current bylines resolve to a
-- structured author. The on-conflict-do-update keeps the seed authoritative
-- if the migration re-runs.
insert into authors (slug, name, role, bio, profile_url, app_slug, status)
  values (
    'vizmaya-desk',
    'The vizmaya desk',
    'Editorial collective',
    'vizmaya is a data-journalism studio publishing visual explainers on geopolitics, energy, technology, and the asymmetries that reshape markets.',
    '/authors/vizmaya-desk',
    'vizmaya-fyi',
    'published'
  )
  on conflict (slug) do update set
    name        = excluded.name,
    role        = excluded.role,
    bio         = excluded.bio,
    profile_url = excluded.profile_url,
    app_slug    = excluded.app_slug,
    status      = excluded.status,
    updated_at  = now();
