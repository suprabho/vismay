-- A competition's full story style — palette + font trio — set in the footshorts
-- Asset Studio and offered by the HTML-stories brief ("Competition style"), so
-- every story about a competition can share one look. Shape (validated by the
-- admin API with parseCompetitionStyle in @vismay/html-stories/styles):
--   { "palette": { "background": "#RRGGBB", "surface", "text", "muted", "accent",
--                  "accent2", "teal", and optionally "line", "positive", "amber", "red" },
--     "fonts":   { "serif": "Forum", "sans": "Space Grotesk", "mono": "Space Mono" } }
-- Only league entities (competitions, cups, tournaments) carry one; null = none.
alter table entities
  add column if not exists story_style jsonb;

alter table entities
  drop constraint if exists entities_story_style_league_only;
alter table entities
  add constraint entities_story_style_league_only
  check (story_style is null or (type = 'league' and jsonb_typeof(story_style) = 'object'));
