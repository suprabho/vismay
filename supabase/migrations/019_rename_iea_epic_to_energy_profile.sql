-- Rename the IEA epic to "energy-profile". The URL and landing component
-- moved from /iea to /energy-profile; this migration renames the epic row
-- so getEpic('energy-profile') resolves it.
--
-- Per-country data tables (iea_news, iea_countries, iea_country_energy) keep
-- their iea_ prefix — those names refer to the data lineage (Google News
-- search for "International Energy Agency", OWID's energy panel) rather than
-- to the epic identifier, and renaming them would require coordinated
-- script + reader changes for no functional gain.
--
-- story_epics.epic_slug FKs into epics.slug with default ON UPDATE NO ACTION,
-- so renaming the parent PK with child rows still pointing at the old value
-- would error. We drop and re-create the FK inside a transaction with both
-- parent and child rows updated to the new slug.

begin;

alter table story_epics drop constraint if exists story_epics_epic_slug_fkey;

update epics
   set slug              = 'energy-profile',
       name              = 'Energy Profile',
       landing_component = 'energy-profile-map',
       updated_at        = now()
 where slug = 'iea';

update story_epics
   set epic_slug = 'energy-profile'
 where epic_slug = 'iea';

alter table story_epics
  add constraint story_epics_epic_slug_fkey
  foreign key (epic_slug) references epics(slug) on delete cascade;

commit;
