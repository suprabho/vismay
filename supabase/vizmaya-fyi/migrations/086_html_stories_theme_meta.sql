-- HTML stories on the home page and the /stories archive.
--
-- The listing cards wear each page's own palette, which the agent declares in
-- the document as <meta name="vizmaya:theme" content="background:#…; text:#…">.
-- Reading it out of `html` on every home-page render would mean pulling every
-- published document (up to 4 MB each), so the tag's content is kept beside it:
-- saveHtmlStory (packages/html-stories/src/htmlStories.ts) writes it on every
-- save, normalised; listPublishedHtmlStories reads it and the page parses it
-- with parseThemeMetaContent (./meta.ts), which drops anything that isn't hex.

alter table html_stories add column if not exists theme_meta text;

-- Backfill from the stored documents (either attribute order). Raw content;
-- the reader validates it.
update html_stories
set theme_meta = coalesce(
  substring(html from '<meta[^>]*name\s*=\s*["'']vizmaya:theme["''][^>]*content\s*=\s*["'']([^"'']*)["'']'),
  substring(html from '<meta[^>]*content\s*=\s*["'']([^"'']*)["''][^>]*name\s*=\s*["'']vizmaya:theme["'']')
)
where theme_meta is null;
