-- Rename team slugs that kept a "glued" acronym from football-data.org's
-- official name. seed.ts commonName() strips club-type tokens (FC, AC, CF, …)
-- on word boundaries, so multi-letter combinations survived: "ACF Fiorentina"
-- seeded as acf-fiorentina, while Gemini extracts "Fiorentina" (slug
-- fiorentina). The resolver found no direct or alias match and silently
-- dropped the tag, so Fiorentina articles never got a team chip. Same class:
-- "Atalanta BC" → atalanta-bc and "Genoa CFC" → genoa-cfc.
--
-- commonName() now strips ACF/BC/CFC too; this migration brings existing rows
-- in line so the next reseed upserts onto the same (type, slug) instead of
-- inserting duplicate entities. Ids are unchanged — follows, article_entities,
-- team_competitions, standings, and squads all reference ids, not slugs.

update entities t
set slug = v.new_slug
from (values
  ('acf-fiorentina', 'fiorentina'),
  ('atalanta-bc',    'atalanta'),
  ('genoa-cfc',      'genoa')
) as v(old_slug, new_slug)
where t.type = 'team'
  and t.slug = v.old_slug
  -- guard the unique (type, slug) constraint in case a target row already exists
  and not exists (
    select 1 from entities e where e.type = 'team' and e.slug = v.new_slug
  );

-- Keep player → team slug pointers in step. (Players aren't seeded with
-- team_slug today, so this is usually a no-op — but the column exists and
-- future backfills shouldn't inherit the stale slugs.)
update entities p
set team_slug = v.new_slug
from (values
  ('acf-fiorentina', 'fiorentina'),
  ('atalanta-bc',    'atalanta'),
  ('genoa-cfc',      'genoa')
) as v(old_slug, new_slug)
where p.team_slug = v.old_slug;

-- 20260615000000_entity_popularity.sql curated ('atalanta', 70), which no-op'd
-- because the row was still atalanta-bc. Re-apply now that the slug matches.
update entities
set popularity = 70
where type = 'team' and slug = 'atalanta' and popularity = 0;
