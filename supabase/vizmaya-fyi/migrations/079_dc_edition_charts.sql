-- 079: composer-planned charts on the daily edition.
--
-- The edition composer now plans one chart per section (energy + the four AI
-- layers) through flint and renders it to SVG at compose time; the row is
-- still the page, so the plan, its sources and the rendered SVG live on the
-- row beside the deterministic `layers` / `energy` blocks they can replace.
-- Sections without a planned chart keep drawing the deterministic templates.
--
-- Additive + idempotent. The published-row guard (078) covers these columns
-- too: a published edition's charts never change.

alter table dc_editions
  add column if not exists charts jsonb not null default '{}'::jsonb,
  -- [{section, reason}] — what the composer held back and why (admin only).
  add column if not exists chart_skips jsonb not null default '[]'::jsonb;

comment on column dc_editions.charts is
  'Composer-planned charts keyed by section (energy|dc|hyper|semi|equip): {title, caption, spec, sources, storyIds, svg, width, height, model, generatedAt}';
comment on column dc_editions.chart_skips is
  'Sections the composer planned no chart for, with the reason: [{section, reason}]';
