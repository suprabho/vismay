-- VizF1 schema v2: constructor logo URLs.
--
-- The original schema had `logo_slug` intended to reference bundled SVGs at
-- @vizf1/brand/src/logos/<slug>.svg, but no SVGs were ever bundled and nothing
-- in the UI read the column — the worker just wrote `logo_slug = constructor_id`
-- as a placeholder. We're replacing it with an explicit external-URL column so
-- the UI can render real team logos without bundling trademarked artwork.

alter table vizf1_constructors add column logo_url text;
alter table vizf1_constructors drop column logo_slug;

-- Seed URLs for the 10 current constructors. The slugs here must match what
-- the worker writes via slug(d.team_name) in ingestSessions.ts. Upsert pattern
-- means a fresh DB gets these rows inserted; an existing DB just refreshes the
-- logo_url for any rows the worker already created.
insert into vizf1_constructors (constructor_id, name, logo_url) values
  ('red_bull_racing', 'Red Bull Racing', 'https://upload.wikimedia.org/wikipedia/en/f/fa/Red_Bull_Racing_Logo_2026.svg'),
  ('ferrari',         'Ferrari',         'https://upload.wikimedia.org/wikipedia/en/d/df/Scuderia_Ferrari_HP_logo_24.svg'),
  ('mercedes',        'Mercedes',        'https://upload.wikimedia.org/wikipedia/commons/f/fc/Mercedes-AMG_Petronas_F1_Team_logo_%282026%29.svg'),
  ('mclaren',         'McLaren',         'https://upload.wikimedia.org/wikipedia/en/6/66/McLaren_Racing_logo.svg'),
  ('aston_martin',    'Aston Martin',    'https://upload.wikimedia.org/wikipedia/en/1/15/Aston_Martin_Aramco_2024_logo.png'),
  ('alpine',          'Alpine',          'https://upload.wikimedia.org/wikipedia/commons/4/4a/BWT_Alpine_F1_Team_Logo.png'),
  ('williams',        'Williams',        'https://upload.wikimedia.org/wikipedia/commons/1/12/Atlassian_Williams_F1_Team_logo.svg'),
  ('rb',              'RB',              'https://upload.wikimedia.org/wikipedia/en/2/2b/VCARB_F1_logo.svg'),
  ('kick_sauber',     'Kick Sauber',     'https://upload.wikimedia.org/wikipedia/commons/9/94/Logo_sauber_2023.jpg'),
  ('haas',            'Haas',            'https://upload.wikimedia.org/wikipedia/commons/1/18/TGR_Haas_F1_Team_Logo_%282026%29.svg')
on conflict (constructor_id) do update set logo_url = excluded.logo_url;
