-- 1. apps lookup
create table if not exists apps (
  slug        text primary key,
  name        text not null,
  status      text not null default 'active' check (status in ('active', 'archived')),
  created_at  timestamptz not null default now()
);

insert into apps (slug, name) values
  ('vizmaya-fyi', 'Vizmaya'),
  ('footshort',   'Footshort'),
  ('vizf1',       'VizF1')
on conflict (slug) do nothing;

-- 2. epics.app_slug
alter table epics add column if not exists app_slug text;
update epics set app_slug = 'vizmaya-fyi' where app_slug is null;
alter table epics
  alter column app_slug set not null,
  alter column app_slug set default 'vizmaya-fyi';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'epics_app_slug_fkey'
  ) then
    alter table epics
      add constraint epics_app_slug_fkey foreign key (app_slug) references apps(slug);
  end if;
end $$;

create index if not exists idx_epics_app_slug on epics(app_slug);

-- 3. stories.app_slug
alter table stories add column if not exists app_slug text;
update stories set app_slug = 'vizmaya-fyi' where app_slug is null;
alter table stories
  alter column app_slug set not null,
  alter column app_slug set default 'vizmaya-fyi';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'stories_app_slug_fkey'
  ) then
    alter table stories
      add constraint stories_app_slug_fkey foreign key (app_slug) references apps(slug);
  end if;
end $$;

create index if not exists idx_stories_app_slug on stories(app_slug);
