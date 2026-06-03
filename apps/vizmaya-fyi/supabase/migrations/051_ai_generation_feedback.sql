-- Author feedback on a single AI generation.
--
-- Feedback is 1:1 with an `ai_generations` row and mutable: an author rates the
-- output thumbs up/down (optionally with a note), and may change that rating
-- later. It lives as columns on the generation row rather than a side table
-- because there is exactly one verdict per generation — the "refine" loop
-- doesn't re-rate a row, it produces a fresh `ai_generations` row to rate.
--
-- All three columns are nullable: most rows are never rated. `rating` is the
-- only signal that feedback exists; `feedback_at` records when it last changed.

alter table ai_generations
  add column if not exists rating           text
    check (rating in ('up', 'down')),
  add column if not exists feedback_comment text,
  add column if not exists feedback_at      timestamptz;

-- "Show me everything authors rated down, newest first" — drives prompt-tuning
-- review. Partial: the vast majority of rows carry no rating.
create index if not exists ai_generations_rating_idx
  on ai_generations (rating, feedback_at desc)
  where rating is not null;
