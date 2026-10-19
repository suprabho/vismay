-- Team-level HTML-story styles: entities.story_style (20261019000000) was for
-- competitions only; teams now carry one too, set in the Asset Studio (Teams)
-- and offered by the HTML-stories brief's "Story style" picker. Players still
-- can't.
alter table entities
  drop constraint if exists entities_story_style_league_only;
alter table entities
  drop constraint if exists entities_story_style_league_or_team;
alter table entities
  add constraint entities_story_style_league_or_team
  check (story_style is null or (type in ('league', 'team') and jsonb_typeof(story_style) = 'object'));
