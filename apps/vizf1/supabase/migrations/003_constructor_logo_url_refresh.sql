-- The seed URLs in migration 002 were guesses against Wikimedia paths that
-- didn't exist except for McLaren — 9 of 10 returned 404, so the UI fell back
-- to abbreviation chips. This migration replaces them with verified URLs (each
-- HEAD-checked at 200). SVG where the original is SVG; otherwise PNG/JPG.
--
-- Worker also writes from @vizf1/brand on every upsert, so future ingests stay
-- in sync without further migrations.

update vizf1_constructors set logo_url = 'https://upload.wikimedia.org/wikipedia/en/f/fa/Red_Bull_Racing_Logo_2026.svg'                                          where constructor_id = 'red_bull_racing';
update vizf1_constructors set logo_url = 'https://upload.wikimedia.org/wikipedia/en/d/df/Scuderia_Ferrari_HP_logo_24.svg'                                       where constructor_id = 'ferrari';
update vizf1_constructors set logo_url = 'https://upload.wikimedia.org/wikipedia/commons/f/fc/Mercedes-AMG_Petronas_F1_Team_logo_%282026%29.svg'                where constructor_id = 'mercedes';
update vizf1_constructors set logo_url = 'https://upload.wikimedia.org/wikipedia/en/6/66/McLaren_Racing_logo.svg'                                                where constructor_id = 'mclaren';
update vizf1_constructors set logo_url = 'https://upload.wikimedia.org/wikipedia/en/1/15/Aston_Martin_Aramco_2024_logo.png'                                      where constructor_id = 'aston_martin';
update vizf1_constructors set logo_url = 'https://upload.wikimedia.org/wikipedia/commons/4/4a/BWT_Alpine_F1_Team_Logo.png'                                       where constructor_id = 'alpine';
update vizf1_constructors set logo_url = 'https://upload.wikimedia.org/wikipedia/commons/1/12/Atlassian_Williams_F1_Team_logo.svg'                               where constructor_id = 'williams';
update vizf1_constructors set logo_url = 'https://upload.wikimedia.org/wikipedia/en/2/2b/VCARB_F1_logo.svg'                                                       where constructor_id = 'rb';
update vizf1_constructors set logo_url = 'https://upload.wikimedia.org/wikipedia/commons/9/94/Logo_sauber_2023.jpg'                                              where constructor_id = 'kick_sauber';
update vizf1_constructors set logo_url = 'https://upload.wikimedia.org/wikipedia/commons/1/18/TGR_Haas_F1_Team_Logo_%282026%29.svg'                              where constructor_id = 'haas';
