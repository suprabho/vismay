-- Travel app (apps/travel/web): password-gated personal trip stories.
--
-- Registers the `travel` app and creates `travel_trips` — one row per trip
-- slug, carrying the per-trip password. Mirrors the `demos` gate (scrypt
-- password_hash, HMAC session cookie via @vismay/content-source/demoAuth)
-- but WITHOUT the stories(slug) FK: travel content is filesystem-mode
-- (markdown + YAML in apps/travel/web/content/stories), so there is no
-- `stories` row to reference. Media reuses the existing public
-- `story-assets` bucket under the trip slug's key prefix — no new buckets.

insert into apps (slug, name)
values ('travel', 'Travel')
on conflict (slug) do nothing;

create table if not exists travel_trips (
  slug          text primary key,
  name          text not null,
  password_hash text not null,
  status        text not null default 'draft'
                check (status in ('draft', 'live', 'archived')),
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- Service-role only, like demos: the trip routes read after server-side
-- password verify, so anon clients never need direct access. RLS on with
-- no policies = deny-all for anon/authenticated.
alter table travel_trips enable row level security;
