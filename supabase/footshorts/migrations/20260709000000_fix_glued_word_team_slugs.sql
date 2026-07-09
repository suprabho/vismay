-- Rename team slugs that kept a "glued" club-type WORD from football-data.org's
-- official name — the sibling of 20260705000000_fix_glued_acronym_team_slugs.sql.
-- seed.ts commonName() stripped club-type acronyms but not the words "Calcio"
-- and "US", so "Cagliari Calcio" seeded as cagliari-calcio while Gemini extracts
-- "Cagliari" (slug cagliari). The resolver found no direct or alias match and
-- silently dropped the tag ([entity-miss] team=Parma showed up in the 2026-07-09
-- ingest logs). Same class: parma-calcio, udinese-calcio, us-sassuolo-calcio.
--
-- commonName() now strips CALCIO/US too; this migration brings existing rows in
-- line so the next reseed upserts onto the same (type, slug) instead of
-- inserting duplicate entities. Ids are unchanged — follows, article_entities,
-- team_competitions, standings, and squads all reference ids, not slugs.
--
-- Applied to prod by hand (REST) on 2026-07-09 alongside the 0705 migration;
-- both are guarded, so a later `db push` re-running them is a no-op.

update entities t
set slug = v.new_slug
from (values
  ('cagliari-calcio',    'cagliari'),
  ('parma-calcio',       'parma'),
  ('udinese-calcio',     'udinese'),
  ('us-sassuolo-calcio', 'sassuolo')
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
  ('cagliari-calcio',    'cagliari'),
  ('parma-calcio',       'parma'),
  ('udinese-calcio',     'udinese'),
  ('us-sassuolo-calcio', 'sassuolo')
) as v(old_slug, new_slug)
where p.team_slug = v.old_slug;

-- Unlike 20260705 (Atalanta), none of these four have curated popularity in
-- 20260615000000_entity_popularity.sql, so there is nothing to re-apply.
