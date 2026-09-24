-- Constructor logos: swap the 48px AVIF marks for vector SVGs.
--
-- The 48x48 AVIFs from 007 went visibly soft once they were drawn larger than
-- a badge (e.g. the story placeholder art, up to ~160px). The same white
-- glyphs now ship as SVGs from the F1 CDN at
-- apps/vizf1/web/public/constructors/<id>.svg. Racing Bulls get their own
-- "RB" mark instead of the shared bulls emblem.
--
-- The AVIFs stay in public/ so rows still pointing at them keep resolving
-- until this runs. Worker writes from @vizf1/brand on every upsert, so it
-- stays in sync afterwards. Idempotent; safe to re-run.

update vizf1_constructors
set logo_url = regexp_replace(logo_url, '^/constructors/([a-z_]+)\.avif$', '/constructors/\1.svg')
where logo_url ~ '^/constructors/[a-z_]+\.avif$';
