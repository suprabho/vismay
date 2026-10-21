-- HTML story formats: + diorama.
--
-- A diorama is a scroll story staged on a tilted 3D model of a place: the
-- camera moves between beats over a map plate with terrain strata, routes,
-- certainty markers and data props (runtime: diorama@1 in
-- packages/html-stories/formats). The page declares it as
-- <meta name="vizmaya:format" content="diorama">, and saveHtmlStory writes it
-- to html_stories.format like the other formats. Until this constraint
-- allows it, saving a diorama page fails.
--
-- Self-contained, like 091: adds the column if 089 never ran, widens the
-- check, and backfills from the stored documents. Safe to run again.

alter table html_stories add column if not exists format text not null default 'scroll';

alter table html_stories drop constraint if exists html_stories_format_check;
alter table html_stories
  add constraint html_stories_format_check check (format in ('scroll', 'book', 'board', 'deck', 'diorama', 'recap'));

-- Backfill from the stored documents (either attribute order), for stories
-- saved before the column existed or before diorama was allowed.
with declared as (
  select slug, lower(trim(coalesce(
    substring(html from '<meta[^>]*name\s*=\s*["'']vizmaya:format["''][^>]*content\s*=\s*["'']([^"'']*)["'']'),
    substring(html from '<meta[^>]*content\s*=\s*["'']([^"'']*)["''][^>]*name\s*=\s*["'']vizmaya:format["'']')
  ))) as format
  from html_stories
)
update html_stories h
set format = d.format
from declared d
where h.slug = d.slug
  and d.format in ('book', 'board', 'deck', 'diorama', 'recap')
  and h.format = 'scroll';

notify pgrst, 'reload schema';
