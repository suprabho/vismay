-- AI Data Centers — three geography layers on dc_news.
--
-- Before this migration a story carried one `place` (a dc_places hub) and a
-- `region`, and the hub list doubled as the country layer: Seoul's aliases
-- included "Korea", Hsinchu's "Taiwan", Mumbai's "India", Oslo's "Finland",
-- Johannesburg's "Nairobi". An audit on 2026-11-03 of the 7.4k tagged rows
-- found 47% of place tags never named the hub in the headline or summary and
-- most of the rest matched only through a country alias — the place pins were
-- country counts drawn on one city. 61% of tagged rows had no region at all.
--
-- Now a story has up to three independent layers:
--
--   1. place   — a locality: a city hub (Hsinchu, Abilene) OR a sub-division
--                (a US state, an Indian state, a Canadian province). Only when
--                the text names it.
--   2. country — ISO 3166-1 alpha-2, from the new dc_countries list. Where the
--                development happens, or the home country of the company the
--                story is about.
--   3. region  — derived from the country (dc_countries.region); the model's
--                own pick only when no country fits.
--
-- Changes:
--   a. dc_countries — the classifier's country vocabulary + centroid + region.
--   b. dc_places gains `country` and `kind` (city | subdivision); country-level
--      aliases are moved off the hubs; new localities for the sub-divisions
--      the feed actually names (Texas, New Jersey, Michigan, Hyderabad, Johor,
--      Hokkaido, …). Slugs never change — published editions freeze them.
--   c. dc_news gains `country`; existing rows are back-filled from their place.
--      Re-tag with: pnpm ai-data-centers:scrape-news -- --retag-geo-days N
--
-- Readers: packages/dc-editions/src/dcEditions.ts (listDcCountries, listDcPlaces)
-- Writer:  apps/vizmaya-fyi/scripts/ai-data-centers/scrape-news.ts

-- ---------------------------------------------------------------------------
-- a. dc_countries

create table if not exists dc_countries (
  code       text primary key,                     -- ISO 3166-1 alpha-2
  name       text not null,
  region     text not null check (region in ('na', 'ea', 'eu', 'me', 'other')),
  lat        double precision not null,            -- centroid, for country-level dots
  lng        double precision not null,
  -- Demonyms and short forms the audit uses to check a tag against the text
  -- ("Korean", "U.S.", "Dutch"). Not matched for the tag itself.
  aliases    text[] not null default '{}',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table dc_countries enable row level security;

drop policy if exists "Public read dc_countries" on dc_countries;
create policy "Public read dc_countries"
  on dc_countries for select
  using (true);

insert into dc_countries (code, name, region, lat, lng, aliases) values
  -- North America
  ('US', 'United States',        'na',    39.8,  -98.6, '{"U.S.","USA","America","American","United States of America"}'),
  ('CA', 'Canada',               'na',    56.1, -106.3, '{"Canadian"}'),
  ('MX', 'Mexico',               'na',    23.6, -102.5, '{"Mexican"}'),
  -- East & Southeast Asia
  ('CN', 'China',                'ea',    35.9,  104.2, '{"Chinese","PRC","Mainland China"}'),
  ('TW', 'Taiwan',               'ea',    23.7,  121.0, '{"Taiwanese"}'),
  ('KR', 'South Korea',          'ea',    36.5,  127.9, '{"Korea","Korean","Republic of Korea"}'),
  ('JP', 'Japan',                'ea',    36.2,  138.3, '{"Japanese"}'),
  ('HK', 'Hong Kong',            'ea',    22.3,  114.2, '{}'),
  ('SG', 'Singapore',            'ea',     1.35, 103.8, '{"Singaporean"}'),
  ('MY', 'Malaysia',             'ea',     4.2,  101.9, '{"Malaysian"}'),
  ('ID', 'Indonesia',            'ea',    -2.5,  118.0, '{"Indonesian"}'),
  ('TH', 'Thailand',             'ea',    15.9,  100.9, '{"Thai"}'),
  ('VN', 'Vietnam',              'ea',    14.1,  108.3, '{"Vietnamese","Viet Nam"}'),
  ('PH', 'Philippines',          'ea',    12.9,  121.8, '{"Philippine","Filipino"}'),
  ('MN', 'Mongolia',             'ea',    46.9,  103.8, '{"Mongolian"}'),
  -- Europe
  ('GB', 'United Kingdom',       'eu',    54.0,   -2.5, '{"UK","U.K.","Britain","British","England","Scotland","Wales"}'),
  ('IE', 'Ireland',              'eu',    53.4,   -8.2, '{"Irish"}'),
  ('NL', 'Netherlands',          'eu',    52.1,    5.3, '{"Dutch","Holland"}'),
  ('BE', 'Belgium',              'eu',    50.5,    4.5, '{"Belgian"}'),
  ('DE', 'Germany',              'eu',    51.2,   10.4, '{"German"}'),
  ('FR', 'France',               'eu',    46.2,    2.2, '{"French"}'),
  ('ES', 'Spain',                'eu',    40.5,   -3.7, '{"Spanish"}'),
  ('PT', 'Portugal',             'eu',    39.4,   -8.2, '{"Portuguese"}'),
  ('IT', 'Italy',                'eu',    41.9,   12.6, '{"Italian"}'),
  ('CH', 'Switzerland',          'eu',    46.8,    8.2, '{"Swiss"}'),
  ('AT', 'Austria',              'eu',    47.5,   14.6, '{"Austrian"}'),
  ('PL', 'Poland',               'eu',    51.9,   19.1, '{"Polish"}'),
  ('CZ', 'Czechia',              'eu',    49.8,   15.5, '{"Czech","Czech Republic"}'),
  ('HU', 'Hungary',              'eu',    47.2,   19.5, '{"Hungarian"}'),
  ('GR', 'Greece',               'eu',    39.1,   21.8, '{"Greek"}'),
  ('NO', 'Norway',               'eu',    60.5,    8.5, '{"Norwegian"}'),
  ('SE', 'Sweden',               'eu',    60.1,   18.6, '{"Swedish"}'),
  ('FI', 'Finland',              'eu',    61.9,   25.7, '{"Finnish"}'),
  ('DK', 'Denmark',              'eu',    56.3,    9.5, '{"Danish"}'),
  ('IS', 'Iceland',              'eu',    65.0,  -19.0, '{"Icelandic"}'),
  ('EE', 'Estonia',              'eu',    58.6,   25.0, '{"Estonian"}'),
  ('LT', 'Lithuania',            'eu',    55.2,   23.9, '{"Lithuanian"}'),
  ('RO', 'Romania',              'eu',    45.9,   25.0, '{"Romanian"}'),
  ('UA', 'Ukraine',              'eu',    48.4,   31.2, '{"Ukrainian"}'),
  ('RU', 'Russia',               'other', 61.5,  105.3, '{"Russian"}'),
  -- India, Middle East & North Africa
  ('IN', 'India',                'me',    20.6,   79.0, '{"Indian"}'),
  ('PK', 'Pakistan',             'me',    30.4,   69.3, '{"Pakistani"}'),
  ('BD', 'Bangladesh',           'me',    23.7,   90.4, '{"Bangladeshi"}'),
  ('LK', 'Sri Lanka',            'me',     7.9,   80.8, '{"Sri Lankan"}'),
  ('AE', 'United Arab Emirates', 'me',    23.4,   53.8, '{"UAE","U.A.E.","Emirates","Emirati","Dubai","Abu Dhabi"}'),
  ('SA', 'Saudi Arabia',         'me',    23.9,   45.1, '{"Saudi","KSA"}'),
  ('QA', 'Qatar',                'me',    25.4,   51.2, '{"Qatari"}'),
  ('OM', 'Oman',                 'me',    21.5,   55.9, '{"Omani"}'),
  ('KW', 'Kuwait',               'me',    29.3,   47.5, '{"Kuwaiti"}'),
  ('BH', 'Bahrain',              'me',    26.0,   50.5, '{"Bahraini"}'),
  ('IL', 'Israel',               'me',    31.0,   34.9, '{"Israeli"}'),
  ('TR', 'Türkiye',              'me',    39.0,   35.2, '{"Turkey","Turkish"}'),
  ('EG', 'Egypt',                'me',    26.8,   30.8, '{"Egyptian"}'),
  ('MA', 'Morocco',              'me',    31.8,   -7.1, '{"Moroccan"}'),
  ('JO', 'Jordan',               'me',    30.6,   36.2, '{"Jordanian"}'),
  -- Rest of world
  ('AU', 'Australia',            'other', -25.3, 133.8, '{"Australian"}'),
  ('NZ', 'New Zealand',          'other', -41.0, 174.0, '{}'),
  ('BR', 'Brazil',               'other', -14.2, -51.9, '{"Brazilian"}'),
  ('AR', 'Argentina',            'other', -38.4, -63.6, '{"Argentine","Argentinian"}'),
  ('CL', 'Chile',                'other', -35.7, -71.5, '{"Chilean"}'),
  ('CO', 'Colombia',             'other',  4.6,  -74.3, '{"Colombian"}'),
  ('PE', 'Peru',                 'other', -9.2,  -75.0, '{"Peruvian"}'),
  ('ZA', 'South Africa',         'other', -30.6,  22.9, '{"South African"}'),
  ('NG', 'Nigeria',              'other',  9.1,    8.7, '{"Nigerian","Lagos"}'),
  ('KE', 'Kenya',                'other', -0.02,  37.9, '{"Kenyan","Nairobi"}'),
  ('GH', 'Ghana',                'other',  7.9,   -1.0, '{"Ghanaian"}'),
  ('ET', 'Ethiopia',             'other',  9.1,   40.5, '{"Ethiopian"}'),
  ('KZ', 'Kazakhstan',           'other', 48.0,   66.9, '{"Kazakh"}'),
  ('UZ', 'Uzbekistan',           'other', 41.4,   64.6, '{"Uzbek"}')
on conflict (code) do update set
  name    = excluded.name,
  region  = excluded.region,
  lat     = excluded.lat,
  lng     = excluded.lng,
  aliases = excluded.aliases;

-- ---------------------------------------------------------------------------
-- b. dc_places — localities only: a city hub or a sub-division, in a country.

alter table dc_places
  add column if not exists country text references dc_countries (code),
  add column if not exists kind    text not null default 'city'
    check (kind in ('city', 'subdivision'));

comment on column dc_places.country is 'ISO 3166-1 alpha-2 (dc_countries.code) the locality is in';
comment on column dc_places.kind    is 'city — a metro/hub · subdivision — a state, province or region within a country';

-- Existing hubs: set the country, strip the country-level aliases (they are
-- the country layer now) and the far-away cities that rode along. Aliases
-- that remain name the hub itself, its own sub-division, or a site that is
-- unmistakably there.
insert into dc_places (slug, name, region, lat, lng, aliases, country, kind) values
  -- United States
  ('abilene',      'Abilene, TX',        'na',  32.45,  -99.73, '{"West Texas","Stargate Abilene"}',                          'US', 'city'),
  ('n-virginia',   'Northern Virginia',  'na',  39.04,  -77.49, '{"Virginia","Loudoun","Ashburn","Data Center Alley","Prince William","Manassas"}', 'US', 'city'),
  ('columbus',     'Columbus, OH',       'na',  39.96,  -83.00, '{"New Albany","Ohio"}',                                      'US', 'city'),
  ('boise',        'Boise, ID',          'na',  43.62, -116.21, '{"Idaho"}',                                                  'US', 'city'),
  ('louisiana',    'Louisiana',          'na',  32.35,  -91.75, '{"Richland Parish","Hyperion"}',                             'US', 'subdivision'),
  ('phoenix',      'Phoenix, AZ',        'na',  33.45, -112.07, '{"Arizona","Mesa","Chandler","Goodyear"}',                   'US', 'city'),
  ('dallas',       'Dallas–Fort Worth',  'na',  32.78,  -96.80, '{"Dallas","DFW","Fort Worth","Plano"}',                      'US', 'city'),
  ('atlanta',      'Atlanta, GA',        'na',  33.75,  -84.39, '{"Georgia","Douglas County"}',                               'US', 'city'),
  ('chicago',      'Chicago, IL',        'na',  41.88,  -87.63, '{"Illinois"}',                                               'US', 'city'),
  ('santa-clara',  'Silicon Valley',     'na',  37.35, -121.95, '{"Santa Clara","San Jose","Bay Area","Sunnyvale","Fremont"}','US', 'city'),
  ('seattle',      'Seattle, WA',        'na',  47.61, -122.33, '{"Redmond","Quincy","Washington state"}',                    'US', 'city'),
  ('memphis',      'Memphis, TN',        'na',  35.15,  -90.05, '{"Colossus","Tennessee"}',                                   'US', 'city'),
  ('texas',        'Texas',              'na',  31.00,  -99.00, '{"Austin","Houston","San Antonio","ERCOT"}',                 'US', 'subdivision'),
  ('new-jersey',   'New Jersey',         'na',  40.06,  -74.41, '{"Vineland","Newark"}',                                      'US', 'subdivision'),
  ('pennsylvania', 'Pennsylvania',       'na',  40.90,  -77.80, '{"Homer City","Pittsburgh"}',                 'US', 'subdivision'),
  ('michigan',     'Michigan',           'na',  44.30,  -85.60, '{"Saline Township","Detroit"}',                              'US', 'subdivision'),
  ('new-mexico',   'New Mexico',         'na',  34.50, -106.00, '{"Doña Ana","Santa Teresa","Albuquerque"}',                  'US', 'subdivision'),
  ('indiana',      'Indiana',            'na',  39.90,  -86.30, '{"New Carlisle","Indianapolis"}',                            'US', 'subdivision'),
  ('oregon',       'Oregon',             'na',  43.80, -120.60, '{"Hillsboro","Prineville","The Dalles","Portland"}',         'US', 'subdivision'),
  ('wisconsin',    'Wisconsin',          'na',  44.50,  -89.50, '{"Mount Pleasant","Port Washington","Racine"}',              'US', 'subdivision'),
  ('nevada',       'Nevada',             'na',  39.30, -116.60, '{"Reno","Las Vegas"}',                                       'US', 'subdivision'),
  ('utah',         'Utah',               'na',  39.30, -111.10, '{"Salt Lake City"}',                                         'US', 'subdivision'),
  ('florida',      'Florida',            'na',  28.60,  -82.40, '{"Miami","Tampa"}',                                          'US', 'subdivision'),
  -- Canada
  ('montreal',     'Montréal',           'na',  45.50,  -73.57, '{"Montreal","Quebec","Québec"}',                             'CA', 'city'),
  ('ontario',      'Ontario',            'na',  50.00,  -85.00, '{"Toronto","Sault Ste. Marie"}',                             'CA', 'subdivision'),
  ('alberta',      'Alberta',            'na',  53.90, -116.60, '{"Calgary","Edmonton"}',                                     'CA', 'subdivision'),
  -- East Asia
  ('seoul',        'Seoul',              'ea',  37.57,  126.98, '{"Icheon","Pyeongtaek","Yongin","Hwaseong","Gyeonggi"}',     'KR', 'city'),
  ('hsinchu',      'Hsinchu',            'ea',  24.80,  120.97, '{"Taichung","Kaohsiung","Chiayi","Taoyuan","Tainan"}',       'TW', 'city'),
  ('tokyo',        'Tokyo',              'ea',  35.68,  139.69, '{"Chiba","Inzai","Kanto"}',                                  'JP', 'city'),
  ('hokkaido',     'Hokkaido',           'ea',  43.06,  141.35, '{"Chitose","Sapporo","Rapidus"}',                            'JP', 'subdivision'),
  ('kumamoto',     'Kumamoto',           'ea',  32.80,  130.70, '{"Kyushu","JASM"}',                                          'JP', 'city'),
  ('shanghai',     'Shanghai',           'ea',  31.23,  121.47, '{"Hangzhou","Wuxi","Suzhou","Yangtze Delta"}',               'CN', 'city'),
  ('beijing',      'Beijing',            'ea',  39.90,  116.40, '{"Tianjin"}',                                                'CN', 'city'),
  ('shenzhen',     'Shenzhen',           'ea',  22.54,  114.06, '{"Guangdong","Dongguan","Guangzhou"}',                       'CN', 'city'),
  ('inner-mongolia','Inner Mongolia',    'ea',  44.00,  113.00, '{"Ulanqab","Hohhot"}',                                       'CN', 'subdivision'),
  ('singapore',    'Singapore',          'ea',   1.35,  103.82, '{}',                                                         'SG', 'city'),
  ('johor',        'Johor',              'ea',   1.90,  103.40, '{"Johor Bahru","Sedenak","Iskandar"}',                       'MY', 'subdivision'),
  ('jakarta',      'Jakarta',            'ea',  -6.20,  106.85, '{"West Java","Bekasi","Java"}',                              'ID', 'city'),
  -- Europe
  ('dublin',       'Dublin',             'eu',  53.35,   -6.26, '{}',                                                         'IE', 'city'),
  ('amsterdam',    'Amsterdam',          'eu',  52.37,    4.90, '{"Eemshaven","Groningen"}',                                  'NL', 'city'),
  ('veldhoven',    'Veldhoven',          'eu',  51.42,    5.40, '{"Eindhoven"}',                                              'NL', 'city'),
  ('frankfurt',    'Frankfurt',          'eu',  50.11,    8.68, '{"Hesse"}',                                                  'DE', 'city'),
  ('london',       'London',             'eu',  51.51,   -0.13, '{"Slough"}',                                                 'GB', 'city'),
  ('paris',        'Paris',              'eu',  48.86,    2.35, '{"Île-de-France"}',                                          'FR', 'city'),
  ('oslo',         'Oslo',               'eu',  59.91,   10.75, '{}',                                                         'NO', 'city'),
  ('madrid',       'Madrid',             'eu',  40.42,   -3.70, '{"Aragon","Aragón"}',                                        'ES', 'city'),
  -- India & Middle East
  ('jamnagar',     'Jamnagar',           'me',  22.47,   70.06, '{"Gujarat","Dholera","Sanand","Reliance"}',                  'IN', 'city'),
  ('mumbai',       'Mumbai',             'me',  19.08,   72.88, '{"Navi Mumbai","Maharashtra","Pune"}',                       'IN', 'city'),
  ('bengaluru',    'Bengaluru',          'me',  12.97,   77.59, '{"Bangalore","Karnataka"}',                                  'IN', 'city'),
  ('hyderabad',    'Hyderabad',          'me',  17.39,   78.49, '{"Telangana"}',                                              'IN', 'city'),
  ('tamil-nadu',   'Tamil Nadu',         'me',  11.10,   78.70, '{"Chennai"}',                                                'IN', 'subdivision'),
  ('odisha',       'Odisha',             'me',  20.90,   84.80, '{"Bhubaneswar"}',                                            'IN', 'subdivision'),
  ('abu-dhabi',    'Abu Dhabi',          'me',  24.45,   54.38, '{"Stargate UAE"}',                                           'AE', 'city'),
  ('riyadh',       'Riyadh',             'me',  24.71,   46.68, '{"NEOM","Humain"}',                                          'SA', 'city'),
  ('doha',         'Doha',               'me',  25.29,   51.53, '{}',                                                         'QA', 'city'),
  -- Rest of world
  ('sydney',       'Sydney',             'other', -33.87, 151.21, '{"New South Wales"}',                                      'AU', 'city'),
  ('sao-paulo',    'São Paulo',          'other', -23.55, -46.63, '{"Sao Paulo","Campinas"}',                                 'BR', 'city'),
  ('johannesburg', 'Johannesburg',       'other', -26.20,  28.05, '{"Gauteng"}',                                              'ZA', 'city')
on conflict (slug) do update set
  name    = excluded.name,
  region  = excluded.region,
  lat     = excluded.lat,
  lng     = excluded.lng,
  aliases = excluded.aliases,
  country = excluded.country,
  kind    = excluded.kind;

-- ---------------------------------------------------------------------------
-- c. dc_news.country

alter table dc_news
  add column if not exists country text;

create index if not exists idx_dc_news_country on dc_news (country) where relevant;

comment on column dc_news.place   is 'dc_places.slug — the locality (city hub or sub-division) the text names, or null';
comment on column dc_news.country is 'ISO 3166-1 alpha-2 (dc_countries.code) the story is about, or null';
comment on column dc_news.region  is 'na | ea | eu | me | other — derived from country when one is set';

-- Seed the country layer from the stored place so nothing reads as blank
-- before the geo re-tag runs (the re-tag re-derives all three columns).
update dc_news n
   set country = p.country
  from dc_places p
 where n.place = p.slug
   and n.country is null
   and p.country is not null;
