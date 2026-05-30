-- Register two new apps: "Storytime with Ovo" and "Experiments".
-- Both reuse the default vizmaya rendering and have no standalone consumer site
-- yet — they exist so stories/epics can be tagged to them and managed in admin.
-- Stories assigned here remain viewable via the vizmaya story reader
-- (/story/<slug>) but are not listed on any public home.
insert into apps (slug, name) values
  ('storytime-ovo', 'Storytime with Ovo'),
  ('experiments',   'Experiments')
on conflict (slug) do nothing;
