-- Saved story themes — the preset library behind the admin theme editor.
--
-- A story's look lives in its markdown frontmatter `theme:` block (colours +
-- fonts, the `Theme` type in packages/viz-engine/src/types/story.ts). Until now
-- every new story was seeded with the neutral light editorial DEFAULT_THEME
-- regardless of app, so a fresh footshorts or vizf1 story opened cream-on-light
-- inside a near-black app, and there was no way to save a palette for reuse.
--
-- This table is that library, shared by every app in this DB:
--   • app_slug null  → the theme is offered to every app's editors ("shared");
--     app_slug set   → only that app's stories see it.
--   • is_default     → the ONE row an app seeds new stories from
--     (POST /api/stories/compose). Shared rows can't be defaults — the
--     code-level DEFAULT_THEME already plays that role for apps without one.
--   • builtin        → seeded here; the admin hides delete (edit is fine).
--
-- Applying a theme to a story COPIES it into the story frontmatter; rows are
-- never linked from stories, so editing a row never restyles existing stories.
--
-- Reader/writer: packages/content-source/src/storyThemes.ts. Seeds mirror
-- STORY_THEME_PRESETS in packages/viz-engine/src/lib/themeDefaults.ts (keep
-- both in sync — the TS list is the fs-mode / no-DB fallback).

create table if not exists story_themes (
  id          uuid primary key default gen_random_uuid(),
  -- Stable key ('<app|shared>-<name>'); the admin merges DB rows over the
  -- built-in TS list by this slug.
  slug        text not null unique,
  name        text not null,
  app_slug    text references apps(slug),
  -- Theme { colors: { background, text, accent, accent2, teal, surface, muted,
  --                   positive?, amber?, red?, line? }, fonts: { serif, sans, mono } }
  theme       jsonb not null,
  is_default  boolean not null default false,
  builtin     boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint story_themes_default_needs_app check (not (is_default and app_slug is null))
);

create index if not exists idx_story_themes_app on story_themes (app_slug);

-- One default per app.
create unique index if not exists idx_story_themes_default_per_app
  on story_themes (app_slug) where is_default;

-- Touch updated_at on every update (mirrors the vizmaya_share_cards trigger).
create or replace function story_themes_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists story_themes_touch on story_themes;
create trigger story_themes_touch
  before update on story_themes
  for each row execute function story_themes_touch_updated_at();

-- Writes go through the service role in the admin API (bypasses RLS); enable RLS
-- with no public policy so the library stays admin-only.
alter table story_themes enable row level security;

-- Built-in presets: the apps' own brand palettes mapped onto the story token
-- vocabulary (accent = brand colour, accent2 = the app's secondary pop).
-- footshorts ← apps/footshorts/brand/src/themes/{classic,pitch,terrace}.ts
-- vizf1      ← apps/vizf1/brand/src/index.ts (+ f1 timing purple/green/yellow)
insert into story_themes (slug, name, app_slug, theme, is_default, builtin, sort_order) values
  ('footshorts-classic', 'Classic', 'footshorts', '{
    "colors": { "background": "#0B0B0F", "surface": "#16161D", "line": "#24242E", "text": "#F4F4F5", "muted": "#8E8E99",
                "accent": "#F26A3C", "accent2": "#00D26A", "teal": "#38BDF8",
                "positive": "#00D26A", "amber": "#FBBF24", "red": "#F87171" },
    "fonts": { "serif": "Forum", "sans": "Space Grotesk", "mono": "Space Mono" }
  }'::jsonb, true, true, 10),
  ('footshorts-pitch', 'Pitch', 'footshorts', '{
    "colors": { "background": "#06140C", "surface": "#0E2517", "line": "#1B3A26", "text": "#ECFDF1", "muted": "#7FA48C",
                "accent": "#F26A3C", "accent2": "#34D399", "teal": "#5EEAD4",
                "positive": "#34D399", "amber": "#FCD34D", "red": "#FB7185" },
    "fonts": { "serif": "Forum", "sans": "Space Grotesk", "mono": "Space Mono" }
  }'::jsonb, false, true, 20),
  ('footshorts-terrace', 'Terrace', 'footshorts', '{
    "colors": { "background": "#FAF7F2", "surface": "#FFFFFF", "line": "#E5DFD3", "text": "#1B1A17", "muted": "#6B675E",
                "accent": "#C2410C", "accent2": "#15803D", "teal": "#0F766E",
                "positive": "#15803D", "amber": "#B45309", "red": "#B91C1C" },
    "fonts": { "serif": "Forum", "sans": "Space Grotesk", "mono": "Space Mono" }
  }'::jsonb, false, true, 30),
  ('vizf1-paddock', 'Paddock', 'vizf1', '{
    "colors": { "background": "#0b0d12", "surface": "#13161d", "line": "#1f2330", "text": "#f5f5f5", "muted": "#8e8e99",
                "accent": "#ff4346", "accent2": "#A855F7", "teal": "#2DD4BF",
                "positive": "#22C55E", "amber": "#FACC15", "red": "#EF4444" },
    "fonts": { "serif": "Inter", "sans": "Inter", "mono": "JetBrains Mono" }
  }'::jsonb, true, true, 10)
on conflict (slug) do nothing;
