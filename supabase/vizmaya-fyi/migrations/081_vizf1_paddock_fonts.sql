-- VizF1 "Paddock" story-theme preset: match the vizf1 app's Pit Wall
-- typography (Saira + Martian Mono) instead of Inter / JetBrains Mono.
-- 077 seeded the row with `on conflict do nothing`, so the live row only
-- changes here. Idempotent: rewrites just the fonts, leaves colours and any
-- editor changes to other keys alone. Code mirror:
-- packages/viz-engine/src/lib/themeDefaults.ts (STORY_THEME_PRESETS).
update story_themes
set theme = jsonb_set(
      theme,
      '{fonts}',
      '{"serif": "Saira", "sans": "Saira", "mono": "Martian Mono"}'::jsonb
    ),
    updated_at = now()
where slug = 'vizf1-paddock'
  and theme -> 'fonts' is distinct from '{"serif": "Saira", "sans": "Saira", "mono": "Martian Mono"}'::jsonb;
