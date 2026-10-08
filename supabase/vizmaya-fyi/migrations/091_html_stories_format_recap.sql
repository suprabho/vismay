-- HTML story formats: + recap (vizf1).
--
-- A race recap is a vizf1 story whose chapters scroll beside the site's 3D
-- race replay, which jumps to each chapter's moment (runtime: recap@1 in
-- packages/html-stories/formats). The page declares it as
-- <meta name="vizmaya:format" content="recap">, and saveHtmlStory writes it
-- to html_stories.format like the other formats. Until this constraint
-- allows it, saving a recap page fails.
--
-- Self-contained: on a database that never got 089, this adds the format
-- column (as 089 does) before widening its check, and backfills it from the
-- stored documents. Safe to run whether or not 089 ran, and to run again.

alter table html_stories add column if not exists format text not null default 'scroll';

alter table html_stories drop constraint if exists html_stories_format_check;
alter table html_stories
  add constraint html_stories_format_check check (format in ('scroll', 'book', 'board', 'deck', 'recap'));

-- Backfill from the stored documents (either attribute order), for stories
-- saved before the column existed or before recap was allowed.
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
  and d.format in ('book', 'board', 'deck', 'recap')
  and h.format = 'scroll';

notify pgrst, 'reload schema';
