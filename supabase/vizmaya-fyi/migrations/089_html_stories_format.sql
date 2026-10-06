-- HTML story formats: scroll, book, board, deck.
--
-- An agent-authored story is a scrolling page by default, or one of the paged
-- formats built on the runtimes each site hosts at /formats (a book you turn,
-- a pinned board with a guided tour, a deck of slides or cards; sources in
-- packages/html-stories/formats). The page declares it as
-- <meta name="vizmaya:format" content="book">. Like the palette (086), it is
-- kept beside the document so the home grid, the archive, the footshorts
-- magazine and the admin list can badge a story without reading its HTML:
-- saveHtmlStory (packages/html-stories/src/htmlStories.ts) writes it on every
-- save from extractFormatMeta (./meta.ts); anything else reads as 'scroll'.

alter table html_stories add column if not exists format text not null default 'scroll';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'html_stories_format_check') then
    alter table html_stories
      add constraint html_stories_format_check check (format in ('scroll', 'book', 'board', 'deck'));
  end if;
end $$;

-- Backfill from the stored documents (either attribute order).
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
  and d.format in ('book', 'board', 'deck')
  and h.format = 'scroll';
