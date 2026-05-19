-- Per-epic visibility on the vizmaya.fyi home page Epics grid.
-- Published epics still render at their direct URL and stay in the sitemap;
-- this flag only controls whether the home-page listing includes them.

alter table epics
  add column if not exists show_on_home boolean not null default true;
