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
  ('red_bull_racing', 'Red Bull Racing', 'https://upload.wikimedia.org/wikipedia/en/c/c6/Red_Bull_Racing_logo.svg'),
  ('ferrari',         'Ferrari',         'https://upload.wikimedia.org/wikipedia/commons/c/c0/Scuderia_Ferrari_Logo.svg'),
  ('mercedes',        'Mercedes',        'https://upload.wikimedia.org/wikipedia/commons/9/90/Mercedes_AMG_Petronas_F1_Logo.svg'),
  ('mclaren',         'McLaren',         'https://upload.wikimedia.org/wikipedia/en/6/66/McLaren_Racing_logo.svg'),
  ('aston_martin',    'Aston Martin',    'https://upload.wikimedia.org/wikipedia/commons/c/c2/Aston_Martin_Cognizant_F1.svg'),
  ('alpine',          'Alpine',          'https://upload.wikimedia.org/wikipedia/commons/9/9d/Alpine_F1_Team_Logo.svg'),
  ('williams',        'Williams',        'https://upload.wikimedia.org/wikipedia/en/4/49/Williams_Racing_2020.png'),
  ('rb',              'RB',              'https://upload.wikimedia.org/wikipedia/commons/c/c7/Visa_Cash_App_RB_F1_Team_logo.svg'),
  ('kick_sauber',     'Kick Sauber',     'https://upload.wikimedia.org/wikipedia/commons/8/86/Stake_F1_Team_Kick_Sauber_logo.svg'),
  ('haas',            'Haas',            'https://upload.wikimedia.org/wikipedia/commons/e/e7/Haas_F1_Team_logo.svg')
on conflict (constructor_id) do update set logo_url = excluded.logo_url;
