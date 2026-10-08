-- HTML story formats: + recap (vizf1).
--
-- A race recap is a vizf1 story whose chapters scroll beside the site's 3D
-- race replay, which jumps to each chapter's moment (runtime: recap@1 in
-- packages/html-stories/formats). The page declares it as
-- <meta name="vizmaya:format" content="recap">, and saveHtmlStory writes it
-- to html_stories.format like the other formats (089). Until this constraint
-- allows it, saving a recap page fails.

alter table html_stories drop constraint if exists html_stories_format_check;
alter table html_stories
  add constraint html_stories_format_check check (format in ('scroll', 'book', 'board', 'deck', 'recap'));

notify pgrst, 'reload schema';
