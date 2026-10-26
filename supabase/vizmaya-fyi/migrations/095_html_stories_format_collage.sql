-- HTML story formats: + collage.
--
-- A cut-out collage is a story on a kraft board: torn-paper pieces taped
-- down, cut-paper charts, typed slips and stamps, choreographed in
-- stop-motion as the page scrolls (runtime: collage@1 in
-- packages/html-stories/formats). The page declares it as
-- <meta name="vizmaya:format" content="collage">, and saveHtmlStory writes
-- it to html_stories.format like the other formats. Until this constraint
-- allows it, saving a collage page fails.
--
-- Numbered after 094 (diorama) and listing every format, so applying the
-- migrations in order keeps both. Self-contained like 091: adds the format
-- column if 089 never ran, widens its check, and backfills from the stored
-- documents. Safe to run again.

alter table html_stories add column if not exists format text not null default 'scroll';

alter table html_stories drop constraint if exists html_stories_format_check;
alter table html_stories
  add constraint html_stories_format_check check (format in ('scroll', 'book', 'board', 'deck', 'diorama', 'collage', 'recap'));

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
  and d.format in ('book', 'board', 'deck', 'diorama', 'collage', 'recap')
  and h.format = 'scroll';

notify pgrst, 'reload schema';
