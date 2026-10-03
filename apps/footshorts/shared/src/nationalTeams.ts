/**
 * Every FIFA member association's senior men's national team — all 211, not
 * just a tournament's qualifiers — so article tagging resolves "Argentina",
 * "Bolivia" or "Faroe Islands" the same way it resolves a club.
 *
 * This list is the source of truth for:
 *   - the `entities(type='team')` rows inserted by
 *     supabase/footshorts/migrations/20261001000000_national_team_entities.sql
 *     (nationalTeams.test.ts in the worker fails if the two drift apart),
 *   - NATIONAL_TEAM_ALIASES, merged into ENTITY_ALIASES (entityKeys.ts),
 *   - the `--national-teams` mode of the worker's backfillEntityTags.ts.
 *
 * `name` is the common English form news copy uses ("Ivory Coast", not
 * "Côte d'Ivoire"), and `slug` is normalizeEntityKey(name) — the key Gemini's
 * extraction lands on. FIFA/official spellings go in `aliases`, already in
 * normalizeEntityKey form.
 *
 * `fifaCode` is FIFA's trigram, the same code `fifa_wc26_teams.code` and
 * `wc26_squads.country_code` use. `flag` is the flagcdn.com code (ISO 3166-1
 * alpha-2, or gb-eng / gb-sct / gb-wls / gb-nir for the home nations); the
 * migration builds crest_url from it.
 */

export type Confederation = 'AFC' | 'CAF' | 'CONCACAF' | 'CONMEBOL' | 'OFC' | 'UEFA';

export type NationalTeam = {
  fifaCode: string;
  name: string;
  slug: string;
  flag: string;
  confederation: Confederation;
  aliases?: string[];
};

export const NATIONAL_TEAMS: readonly NationalTeam[] = [
  // ── AFC (46) ────────────────────────────────────────────────────────────
  { fifaCode: 'AFG', name: 'Afghanistan', slug: 'afghanistan', flag: 'af', confederation: 'AFC' },
  { fifaCode: 'AUS', name: 'Australia', slug: 'australia', flag: 'au', confederation: 'AFC' },
  { fifaCode: 'BHR', name: 'Bahrain', slug: 'bahrain', flag: 'bh', confederation: 'AFC' },
  { fifaCode: 'BAN', name: 'Bangladesh', slug: 'bangladesh', flag: 'bd', confederation: 'AFC' },
  { fifaCode: 'BHU', name: 'Bhutan', slug: 'bhutan', flag: 'bt', confederation: 'AFC' },
  { fifaCode: 'BRU', name: 'Brunei', slug: 'brunei', flag: 'bn', confederation: 'AFC', aliases: ['brunei-darussalam'] },
  { fifaCode: 'CAM', name: 'Cambodia', slug: 'cambodia', flag: 'kh', confederation: 'AFC' },
  { fifaCode: 'CHN', name: 'China', slug: 'china', flag: 'cn', confederation: 'AFC', aliases: ['china-pr'] },
  { fifaCode: 'TPE', name: 'Chinese Taipei', slug: 'chinese-taipei', flag: 'tw', confederation: 'AFC', aliases: ['taiwan'] },
  { fifaCode: 'GUM', name: 'Guam', slug: 'guam', flag: 'gu', confederation: 'AFC' },
  { fifaCode: 'HKG', name: 'Hong Kong', slug: 'hong-kong', flag: 'hk', confederation: 'AFC', aliases: ['hong-kong-china'] },
  { fifaCode: 'IND', name: 'India', slug: 'india', flag: 'in', confederation: 'AFC' },
  { fifaCode: 'IDN', name: 'Indonesia', slug: 'indonesia', flag: 'id', confederation: 'AFC' },
  { fifaCode: 'IRN', name: 'Iran', slug: 'iran', flag: 'ir', confederation: 'AFC', aliases: ['ir-iran'] },
  { fifaCode: 'IRQ', name: 'Iraq', slug: 'iraq', flag: 'iq', confederation: 'AFC' },
  { fifaCode: 'JPN', name: 'Japan', slug: 'japan', flag: 'jp', confederation: 'AFC' },
  { fifaCode: 'JOR', name: 'Jordan', slug: 'jordan', flag: 'jo', confederation: 'AFC' },
  { fifaCode: 'KUW', name: 'Kuwait', slug: 'kuwait', flag: 'kw', confederation: 'AFC' },
  { fifaCode: 'KGZ', name: 'Kyrgyzstan', slug: 'kyrgyzstan', flag: 'kg', confederation: 'AFC', aliases: ['kyrgyz-republic'] },
  { fifaCode: 'LAO', name: 'Laos', slug: 'laos', flag: 'la', confederation: 'AFC' },
  { fifaCode: 'LBN', name: 'Lebanon', slug: 'lebanon', flag: 'lb', confederation: 'AFC' },
  { fifaCode: 'MAC', name: 'Macau', slug: 'macau', flag: 'mo', confederation: 'AFC', aliases: ['macao'] },
  { fifaCode: 'MAS', name: 'Malaysia', slug: 'malaysia', flag: 'my', confederation: 'AFC' },
  { fifaCode: 'MDV', name: 'Maldives', slug: 'maldives', flag: 'mv', confederation: 'AFC' },
  { fifaCode: 'MNG', name: 'Mongolia', slug: 'mongolia', flag: 'mn', confederation: 'AFC' },
  { fifaCode: 'MYA', name: 'Myanmar', slug: 'myanmar', flag: 'mm', confederation: 'AFC', aliases: ['burma'] },
  { fifaCode: 'NEP', name: 'Nepal', slug: 'nepal', flag: 'np', confederation: 'AFC' },
  { fifaCode: 'PRK', name: 'North Korea', slug: 'north-korea', flag: 'kp', confederation: 'AFC', aliases: ['korea-dpr', 'dpr-korea'] },
  { fifaCode: 'OMA', name: 'Oman', slug: 'oman', flag: 'om', confederation: 'AFC' },
  { fifaCode: 'PAK', name: 'Pakistan', slug: 'pakistan', flag: 'pk', confederation: 'AFC' },
  { fifaCode: 'PLE', name: 'Palestine', slug: 'palestine', flag: 'ps', confederation: 'AFC' },
  { fifaCode: 'PHI', name: 'Philippines', slug: 'philippines', flag: 'ph', confederation: 'AFC' },
  { fifaCode: 'QAT', name: 'Qatar', slug: 'qatar', flag: 'qa', confederation: 'AFC' },
  { fifaCode: 'KSA', name: 'Saudi Arabia', slug: 'saudi-arabia', flag: 'sa', confederation: 'AFC' },
  { fifaCode: 'SGP', name: 'Singapore', slug: 'singapore', flag: 'sg', confederation: 'AFC' },
  { fifaCode: 'KOR', name: 'South Korea', slug: 'south-korea', flag: 'kr', confederation: 'AFC', aliases: ['korea-republic', 'republic-of-korea'] },
  { fifaCode: 'SRI', name: 'Sri Lanka', slug: 'sri-lanka', flag: 'lk', confederation: 'AFC' },
  { fifaCode: 'SYR', name: 'Syria', slug: 'syria', flag: 'sy', confederation: 'AFC' },
  { fifaCode: 'TJK', name: 'Tajikistan', slug: 'tajikistan', flag: 'tj', confederation: 'AFC' },
  { fifaCode: 'THA', name: 'Thailand', slug: 'thailand', flag: 'th', confederation: 'AFC' },
  { fifaCode: 'TLS', name: 'Timor-Leste', slug: 'timor-leste', flag: 'tl', confederation: 'AFC', aliases: ['east-timor'] },
  { fifaCode: 'TKM', name: 'Turkmenistan', slug: 'turkmenistan', flag: 'tm', confederation: 'AFC' },
  { fifaCode: 'UAE', name: 'United Arab Emirates', slug: 'united-arab-emirates', flag: 'ae', confederation: 'AFC', aliases: ['uae'] },
  { fifaCode: 'UZB', name: 'Uzbekistan', slug: 'uzbekistan', flag: 'uz', confederation: 'AFC' },
  { fifaCode: 'VIE', name: 'Vietnam', slug: 'vietnam', flag: 'vn', confederation: 'AFC', aliases: ['viet-nam'] },
  { fifaCode: 'YEM', name: 'Yemen', slug: 'yemen', flag: 'ye', confederation: 'AFC' },

  // ── CAF (54) ────────────────────────────────────────────────────────────
  { fifaCode: 'ALG', name: 'Algeria', slug: 'algeria', flag: 'dz', confederation: 'CAF' },
  { fifaCode: 'ANG', name: 'Angola', slug: 'angola', flag: 'ao', confederation: 'CAF' },
  { fifaCode: 'BEN', name: 'Benin', slug: 'benin', flag: 'bj', confederation: 'CAF' },
  { fifaCode: 'BOT', name: 'Botswana', slug: 'botswana', flag: 'bw', confederation: 'CAF' },
  { fifaCode: 'BFA', name: 'Burkina Faso', slug: 'burkina-faso', flag: 'bf', confederation: 'CAF' },
  { fifaCode: 'BDI', name: 'Burundi', slug: 'burundi', flag: 'bi', confederation: 'CAF' },
  { fifaCode: 'CMR', name: 'Cameroon', slug: 'cameroon', flag: 'cm', confederation: 'CAF' },
  { fifaCode: 'CPV', name: 'Cape Verde', slug: 'cape-verde', flag: 'cv', confederation: 'CAF', aliases: ['cabo-verde'] },
  { fifaCode: 'CTA', name: 'Central African Republic', slug: 'central-african-republic', flag: 'cf', confederation: 'CAF' },
  { fifaCode: 'CHA', name: 'Chad', slug: 'chad', flag: 'td', confederation: 'CAF' },
  { fifaCode: 'COM', name: 'Comoros', slug: 'comoros', flag: 'km', confederation: 'CAF' },
  { fifaCode: 'CGO', name: 'Congo', slug: 'congo', flag: 'cg', confederation: 'CAF', aliases: ['republic-of-the-congo', 'congo-brazzaville'] },
  { fifaCode: 'COD', name: 'DR Congo', slug: 'dr-congo', flag: 'cd', confederation: 'CAF', aliases: ['congo-dr', 'democratic-republic-of-the-congo', 'democratic-republic-of-congo'] },
  { fifaCode: 'DJI', name: 'Djibouti', slug: 'djibouti', flag: 'dj', confederation: 'CAF' },
  { fifaCode: 'EGY', name: 'Egypt', slug: 'egypt', flag: 'eg', confederation: 'CAF' },
  { fifaCode: 'EQG', name: 'Equatorial Guinea', slug: 'equatorial-guinea', flag: 'gq', confederation: 'CAF' },
  { fifaCode: 'ERI', name: 'Eritrea', slug: 'eritrea', flag: 'er', confederation: 'CAF' },
  { fifaCode: 'SWZ', name: 'Eswatini', slug: 'eswatini', flag: 'sz', confederation: 'CAF', aliases: ['swaziland'] },
  { fifaCode: 'ETH', name: 'Ethiopia', slug: 'ethiopia', flag: 'et', confederation: 'CAF' },
  { fifaCode: 'GAB', name: 'Gabon', slug: 'gabon', flag: 'ga', confederation: 'CAF' },
  { fifaCode: 'GAM', name: 'Gambia', slug: 'gambia', flag: 'gm', confederation: 'CAF', aliases: ['the-gambia'] },
  { fifaCode: 'GHA', name: 'Ghana', slug: 'ghana', flag: 'gh', confederation: 'CAF' },
  { fifaCode: 'GUI', name: 'Guinea', slug: 'guinea', flag: 'gn', confederation: 'CAF' },
  { fifaCode: 'GNB', name: 'Guinea-Bissau', slug: 'guinea-bissau', flag: 'gw', confederation: 'CAF' },
  { fifaCode: 'CIV', name: 'Ivory Coast', slug: 'ivory-coast', flag: 'ci', confederation: 'CAF', aliases: ['cote-d-ivoire', 'cote-divoire'] },
  { fifaCode: 'KEN', name: 'Kenya', slug: 'kenya', flag: 'ke', confederation: 'CAF' },
  { fifaCode: 'LES', name: 'Lesotho', slug: 'lesotho', flag: 'ls', confederation: 'CAF' },
  { fifaCode: 'LBR', name: 'Liberia', slug: 'liberia', flag: 'lr', confederation: 'CAF' },
  { fifaCode: 'LBY', name: 'Libya', slug: 'libya', flag: 'ly', confederation: 'CAF' },
  { fifaCode: 'MAD', name: 'Madagascar', slug: 'madagascar', flag: 'mg', confederation: 'CAF' },
  { fifaCode: 'MWI', name: 'Malawi', slug: 'malawi', flag: 'mw', confederation: 'CAF' },
  { fifaCode: 'MLI', name: 'Mali', slug: 'mali', flag: 'ml', confederation: 'CAF' },
  { fifaCode: 'MTN', name: 'Mauritania', slug: 'mauritania', flag: 'mr', confederation: 'CAF' },
  { fifaCode: 'MRI', name: 'Mauritius', slug: 'mauritius', flag: 'mu', confederation: 'CAF' },
  { fifaCode: 'MAR', name: 'Morocco', slug: 'morocco', flag: 'ma', confederation: 'CAF' },
  { fifaCode: 'MOZ', name: 'Mozambique', slug: 'mozambique', flag: 'mz', confederation: 'CAF' },
  { fifaCode: 'NAM', name: 'Namibia', slug: 'namibia', flag: 'na', confederation: 'CAF' },
  { fifaCode: 'NIG', name: 'Niger', slug: 'niger', flag: 'ne', confederation: 'CAF' },
  { fifaCode: 'NGA', name: 'Nigeria', slug: 'nigeria', flag: 'ng', confederation: 'CAF' },
  { fifaCode: 'RWA', name: 'Rwanda', slug: 'rwanda', flag: 'rw', confederation: 'CAF' },
  { fifaCode: 'STP', name: 'São Tomé and Príncipe', slug: 'sao-tome-and-principe', flag: 'st', confederation: 'CAF', aliases: ['sao-tome-principe'] },
  { fifaCode: 'SEN', name: 'Senegal', slug: 'senegal', flag: 'sn', confederation: 'CAF' },
  { fifaCode: 'SEY', name: 'Seychelles', slug: 'seychelles', flag: 'sc', confederation: 'CAF' },
  { fifaCode: 'SLE', name: 'Sierra Leone', slug: 'sierra-leone', flag: 'sl', confederation: 'CAF' },
  { fifaCode: 'SOM', name: 'Somalia', slug: 'somalia', flag: 'so', confederation: 'CAF' },
  { fifaCode: 'RSA', name: 'South Africa', slug: 'south-africa', flag: 'za', confederation: 'CAF' },
  { fifaCode: 'SSD', name: 'South Sudan', slug: 'south-sudan', flag: 'ss', confederation: 'CAF' },
  { fifaCode: 'SDN', name: 'Sudan', slug: 'sudan', flag: 'sd', confederation: 'CAF' },
  { fifaCode: 'TAN', name: 'Tanzania', slug: 'tanzania', flag: 'tz', confederation: 'CAF' },
  { fifaCode: 'TOG', name: 'Togo', slug: 'togo', flag: 'tg', confederation: 'CAF' },
  { fifaCode: 'TUN', name: 'Tunisia', slug: 'tunisia', flag: 'tn', confederation: 'CAF' },
  { fifaCode: 'UGA', name: 'Uganda', slug: 'uganda', flag: 'ug', confederation: 'CAF' },
  { fifaCode: 'ZAM', name: 'Zambia', slug: 'zambia', flag: 'zm', confederation: 'CAF' },
  { fifaCode: 'ZIM', name: 'Zimbabwe', slug: 'zimbabwe', flag: 'zw', confederation: 'CAF' },

  // ── CONCACAF (35) ───────────────────────────────────────────────────────
  { fifaCode: 'AIA', name: 'Anguilla', slug: 'anguilla', flag: 'ai', confederation: 'CONCACAF' },
  { fifaCode: 'ATG', name: 'Antigua and Barbuda', slug: 'antigua-and-barbuda', flag: 'ag', confederation: 'CONCACAF', aliases: ['antigua-barbuda'] },
  { fifaCode: 'ARU', name: 'Aruba', slug: 'aruba', flag: 'aw', confederation: 'CONCACAF' },
  { fifaCode: 'BAH', name: 'Bahamas', slug: 'bahamas', flag: 'bs', confederation: 'CONCACAF', aliases: ['the-bahamas'] },
  { fifaCode: 'BRB', name: 'Barbados', slug: 'barbados', flag: 'bb', confederation: 'CONCACAF' },
  { fifaCode: 'BLZ', name: 'Belize', slug: 'belize', flag: 'bz', confederation: 'CONCACAF' },
  { fifaCode: 'BER', name: 'Bermuda', slug: 'bermuda', flag: 'bm', confederation: 'CONCACAF' },
  { fifaCode: 'VGB', name: 'British Virgin Islands', slug: 'british-virgin-islands', flag: 'vg', confederation: 'CONCACAF' },
  { fifaCode: 'CAN', name: 'Canada', slug: 'canada', flag: 'ca', confederation: 'CONCACAF' },
  { fifaCode: 'CAY', name: 'Cayman Islands', slug: 'cayman-islands', flag: 'ky', confederation: 'CONCACAF' },
  { fifaCode: 'CRC', name: 'Costa Rica', slug: 'costa-rica', flag: 'cr', confederation: 'CONCACAF' },
  { fifaCode: 'CUB', name: 'Cuba', slug: 'cuba', flag: 'cu', confederation: 'CONCACAF' },
  { fifaCode: 'CUW', name: 'Curaçao', slug: 'curacao', flag: 'cw', confederation: 'CONCACAF' },
  { fifaCode: 'DMA', name: 'Dominica', slug: 'dominica', flag: 'dm', confederation: 'CONCACAF' },
  { fifaCode: 'DOM', name: 'Dominican Republic', slug: 'dominican-republic', flag: 'do', confederation: 'CONCACAF' },
  { fifaCode: 'SLV', name: 'El Salvador', slug: 'el-salvador', flag: 'sv', confederation: 'CONCACAF' },
  { fifaCode: 'GRN', name: 'Grenada', slug: 'grenada', flag: 'gd', confederation: 'CONCACAF' },
  { fifaCode: 'GUA', name: 'Guatemala', slug: 'guatemala', flag: 'gt', confederation: 'CONCACAF' },
  { fifaCode: 'GUY', name: 'Guyana', slug: 'guyana', flag: 'gy', confederation: 'CONCACAF' },
  { fifaCode: 'HAI', name: 'Haiti', slug: 'haiti', flag: 'ht', confederation: 'CONCACAF' },
  { fifaCode: 'HON', name: 'Honduras', slug: 'honduras', flag: 'hn', confederation: 'CONCACAF' },
  { fifaCode: 'JAM', name: 'Jamaica', slug: 'jamaica', flag: 'jm', confederation: 'CONCACAF' },
  { fifaCode: 'MEX', name: 'Mexico', slug: 'mexico', flag: 'mx', confederation: 'CONCACAF' },
  { fifaCode: 'MSR', name: 'Montserrat', slug: 'montserrat', flag: 'ms', confederation: 'CONCACAF' },
  { fifaCode: 'NCA', name: 'Nicaragua', slug: 'nicaragua', flag: 'ni', confederation: 'CONCACAF' },
  { fifaCode: 'PAN', name: 'Panama', slug: 'panama', flag: 'pa', confederation: 'CONCACAF' },
  { fifaCode: 'PUR', name: 'Puerto Rico', slug: 'puerto-rico', flag: 'pr', confederation: 'CONCACAF' },
  { fifaCode: 'SKN', name: 'Saint Kitts and Nevis', slug: 'saint-kitts-and-nevis', flag: 'kn', confederation: 'CONCACAF', aliases: ['st-kitts-and-nevis', 'st-kitts-nevis'] },
  { fifaCode: 'LCA', name: 'Saint Lucia', slug: 'saint-lucia', flag: 'lc', confederation: 'CONCACAF', aliases: ['st-lucia'] },
  { fifaCode: 'VIN', name: 'Saint Vincent and the Grenadines', slug: 'saint-vincent-and-the-grenadines', flag: 'vc', confederation: 'CONCACAF', aliases: ['st-vincent-and-the-grenadines', 'st-vincent-grenadines'] },
  { fifaCode: 'SUR', name: 'Suriname', slug: 'suriname', flag: 'sr', confederation: 'CONCACAF' },
  { fifaCode: 'TRI', name: 'Trinidad and Tobago', slug: 'trinidad-and-tobago', flag: 'tt', confederation: 'CONCACAF', aliases: ['trinidad-tobago'] },
  { fifaCode: 'TCA', name: 'Turks and Caicos Islands', slug: 'turks-and-caicos-islands', flag: 'tc', confederation: 'CONCACAF', aliases: ['turks-and-caicos'] },
  { fifaCode: 'USA', name: 'United States', slug: 'united-states', flag: 'us', confederation: 'CONCACAF', aliases: ['usa', 'usmnt', 'united-states-of-america'] },
  { fifaCode: 'VIR', name: 'US Virgin Islands', slug: 'us-virgin-islands', flag: 'vi', confederation: 'CONCACAF', aliases: ['united-states-virgin-islands'] },

  // ── CONMEBOL (10) ───────────────────────────────────────────────────────
  { fifaCode: 'ARG', name: 'Argentina', slug: 'argentina', flag: 'ar', confederation: 'CONMEBOL' },
  { fifaCode: 'BOL', name: 'Bolivia', slug: 'bolivia', flag: 'bo', confederation: 'CONMEBOL' },
  { fifaCode: 'BRA', name: 'Brazil', slug: 'brazil', flag: 'br', confederation: 'CONMEBOL' },
  { fifaCode: 'CHI', name: 'Chile', slug: 'chile', flag: 'cl', confederation: 'CONMEBOL' },
  { fifaCode: 'COL', name: 'Colombia', slug: 'colombia', flag: 'co', confederation: 'CONMEBOL' },
  { fifaCode: 'ECU', name: 'Ecuador', slug: 'ecuador', flag: 'ec', confederation: 'CONMEBOL' },
  { fifaCode: 'PAR', name: 'Paraguay', slug: 'paraguay', flag: 'py', confederation: 'CONMEBOL' },
  { fifaCode: 'PER', name: 'Peru', slug: 'peru', flag: 'pe', confederation: 'CONMEBOL' },
  { fifaCode: 'URU', name: 'Uruguay', slug: 'uruguay', flag: 'uy', confederation: 'CONMEBOL' },
  { fifaCode: 'VEN', name: 'Venezuela', slug: 'venezuela', flag: 've', confederation: 'CONMEBOL' },

  // ── OFC (11) ────────────────────────────────────────────────────────────
  { fifaCode: 'ASA', name: 'American Samoa', slug: 'american-samoa', flag: 'as', confederation: 'OFC' },
  { fifaCode: 'COK', name: 'Cook Islands', slug: 'cook-islands', flag: 'ck', confederation: 'OFC' },
  { fifaCode: 'FIJ', name: 'Fiji', slug: 'fiji', flag: 'fj', confederation: 'OFC' },
  { fifaCode: 'NCL', name: 'New Caledonia', slug: 'new-caledonia', flag: 'nc', confederation: 'OFC' },
  { fifaCode: 'NZL', name: 'New Zealand', slug: 'new-zealand', flag: 'nz', confederation: 'OFC' },
  { fifaCode: 'PNG', name: 'Papua New Guinea', slug: 'papua-new-guinea', flag: 'pg', confederation: 'OFC' },
  { fifaCode: 'SAM', name: 'Samoa', slug: 'samoa', flag: 'ws', confederation: 'OFC' },
  { fifaCode: 'SOL', name: 'Solomon Islands', slug: 'solomon-islands', flag: 'sb', confederation: 'OFC' },
  { fifaCode: 'TAH', name: 'Tahiti', slug: 'tahiti', flag: 'pf', confederation: 'OFC' },
  { fifaCode: 'TGA', name: 'Tonga', slug: 'tonga', flag: 'to', confederation: 'OFC' },
  { fifaCode: 'VAN', name: 'Vanuatu', slug: 'vanuatu', flag: 'vu', confederation: 'OFC' },

  // ── UEFA (55) ───────────────────────────────────────────────────────────
  { fifaCode: 'ALB', name: 'Albania', slug: 'albania', flag: 'al', confederation: 'UEFA' },
  { fifaCode: 'AND', name: 'Andorra', slug: 'andorra', flag: 'ad', confederation: 'UEFA' },
  { fifaCode: 'ARM', name: 'Armenia', slug: 'armenia', flag: 'am', confederation: 'UEFA' },
  { fifaCode: 'AUT', name: 'Austria', slug: 'austria', flag: 'at', confederation: 'UEFA' },
  { fifaCode: 'AZE', name: 'Azerbaijan', slug: 'azerbaijan', flag: 'az', confederation: 'UEFA' },
  { fifaCode: 'BLR', name: 'Belarus', slug: 'belarus', flag: 'by', confederation: 'UEFA' },
  { fifaCode: 'BEL', name: 'Belgium', slug: 'belgium', flag: 'be', confederation: 'UEFA' },
  { fifaCode: 'BIH', name: 'Bosnia and Herzegovina', slug: 'bosnia-and-herzegovina', flag: 'ba', confederation: 'UEFA', aliases: ['bosnia-herzegovina', 'bosnia', 'bosnia-herz'] },
  { fifaCode: 'BUL', name: 'Bulgaria', slug: 'bulgaria', flag: 'bg', confederation: 'UEFA' },
  { fifaCode: 'CRO', name: 'Croatia', slug: 'croatia', flag: 'hr', confederation: 'UEFA' },
  { fifaCode: 'CYP', name: 'Cyprus', slug: 'cyprus', flag: 'cy', confederation: 'UEFA' },
  { fifaCode: 'CZE', name: 'Czechia', slug: 'czechia', flag: 'cz', confederation: 'UEFA', aliases: ['czech-republic'] },
  { fifaCode: 'DEN', name: 'Denmark', slug: 'denmark', flag: 'dk', confederation: 'UEFA' },
  { fifaCode: 'ENG', name: 'England', slug: 'england', flag: 'gb-eng', confederation: 'UEFA' },
  { fifaCode: 'EST', name: 'Estonia', slug: 'estonia', flag: 'ee', confederation: 'UEFA' },
  { fifaCode: 'FRO', name: 'Faroe Islands', slug: 'faroe-islands', flag: 'fo', confederation: 'UEFA', aliases: ['faroes'] },
  { fifaCode: 'FIN', name: 'Finland', slug: 'finland', flag: 'fi', confederation: 'UEFA' },
  { fifaCode: 'FRA', name: 'France', slug: 'france', flag: 'fr', confederation: 'UEFA' },
  { fifaCode: 'GEO', name: 'Georgia', slug: 'georgia', flag: 'ge', confederation: 'UEFA' },
  { fifaCode: 'GER', name: 'Germany', slug: 'germany', flag: 'de', confederation: 'UEFA' },
  { fifaCode: 'GIB', name: 'Gibraltar', slug: 'gibraltar', flag: 'gi', confederation: 'UEFA' },
  { fifaCode: 'GRE', name: 'Greece', slug: 'greece', flag: 'gr', confederation: 'UEFA' },
  { fifaCode: 'HUN', name: 'Hungary', slug: 'hungary', flag: 'hu', confederation: 'UEFA' },
  { fifaCode: 'ISL', name: 'Iceland', slug: 'iceland', flag: 'is', confederation: 'UEFA' },
  { fifaCode: 'ISR', name: 'Israel', slug: 'israel', flag: 'il', confederation: 'UEFA' },
  { fifaCode: 'ITA', name: 'Italy', slug: 'italy', flag: 'it', confederation: 'UEFA' },
  { fifaCode: 'KAZ', name: 'Kazakhstan', slug: 'kazakhstan', flag: 'kz', confederation: 'UEFA' },
  { fifaCode: 'KVX', name: 'Kosovo', slug: 'kosovo', flag: 'xk', confederation: 'UEFA' },
  { fifaCode: 'LVA', name: 'Latvia', slug: 'latvia', flag: 'lv', confederation: 'UEFA' },
  { fifaCode: 'LIE', name: 'Liechtenstein', slug: 'liechtenstein', flag: 'li', confederation: 'UEFA' },
  { fifaCode: 'LTU', name: 'Lithuania', slug: 'lithuania', flag: 'lt', confederation: 'UEFA' },
  { fifaCode: 'LUX', name: 'Luxembourg', slug: 'luxembourg', flag: 'lu', confederation: 'UEFA' },
  { fifaCode: 'MLT', name: 'Malta', slug: 'malta', flag: 'mt', confederation: 'UEFA' },
  { fifaCode: 'MDA', name: 'Moldova', slug: 'moldova', flag: 'md', confederation: 'UEFA' },
  { fifaCode: 'MNE', name: 'Montenegro', slug: 'montenegro', flag: 'me', confederation: 'UEFA' },
  { fifaCode: 'NED', name: 'Netherlands', slug: 'netherlands', flag: 'nl', confederation: 'UEFA', aliases: ['holland'] },
  { fifaCode: 'MKD', name: 'North Macedonia', slug: 'north-macedonia', flag: 'mk', confederation: 'UEFA', aliases: ['macedonia'] },
  { fifaCode: 'NIR', name: 'Northern Ireland', slug: 'northern-ireland', flag: 'gb-nir', confederation: 'UEFA' },
  { fifaCode: 'NOR', name: 'Norway', slug: 'norway', flag: 'no', confederation: 'UEFA' },
  { fifaCode: 'POL', name: 'Poland', slug: 'poland', flag: 'pl', confederation: 'UEFA' },
  { fifaCode: 'POR', name: 'Portugal', slug: 'portugal', flag: 'pt', confederation: 'UEFA' },
  { fifaCode: 'IRL', name: 'Republic of Ireland', slug: 'republic-of-ireland', flag: 'ie', confederation: 'UEFA', aliases: ['ireland', 'rep-of-ireland'] },
  { fifaCode: 'ROU', name: 'Romania', slug: 'romania', flag: 'ro', confederation: 'UEFA' },
  { fifaCode: 'RUS', name: 'Russia', slug: 'russia', flag: 'ru', confederation: 'UEFA' },
  { fifaCode: 'SMR', name: 'San Marino', slug: 'san-marino', flag: 'sm', confederation: 'UEFA' },
  { fifaCode: 'SCO', name: 'Scotland', slug: 'scotland', flag: 'gb-sct', confederation: 'UEFA' },
  { fifaCode: 'SRB', name: 'Serbia', slug: 'serbia', flag: 'rs', confederation: 'UEFA' },
  { fifaCode: 'SVK', name: 'Slovakia', slug: 'slovakia', flag: 'sk', confederation: 'UEFA' },
  { fifaCode: 'SVN', name: 'Slovenia', slug: 'slovenia', flag: 'si', confederation: 'UEFA' },
  { fifaCode: 'ESP', name: 'Spain', slug: 'spain', flag: 'es', confederation: 'UEFA' },
  { fifaCode: 'SWE', name: 'Sweden', slug: 'sweden', flag: 'se', confederation: 'UEFA' },
  { fifaCode: 'SUI', name: 'Switzerland', slug: 'switzerland', flag: 'ch', confederation: 'UEFA' },
  { fifaCode: 'TUR', name: 'Turkey', slug: 'turkey', flag: 'tr', confederation: 'UEFA', aliases: ['turkiye'] },
  { fifaCode: 'UKR', name: 'Ukraine', slug: 'ukraine', flag: 'ua', confederation: 'UEFA' },
  { fifaCode: 'WAL', name: 'Wales', slug: 'wales', flag: 'gb-wls', confederation: 'UEFA' },
];

/** flagcdn.com PNG for a team — PNG (not SVG) so backfillColors' sharp
 *  pipeline can sample it into primary_color. */
export function nationalTeamFlagUrl(team: Pick<NationalTeam, 'flag'>): string {
  return `https://flagcdn.com/w320/${team.flag}.png`;
}

/** Alternate spellings → canonical national-team slug, merged into
 *  ENTITY_ALIASES so the article resolver, fixtures and story hydrator all
 *  accept "Côte d'Ivoire", "Korea Republic", "USA", "Türkiye", … */
export const NATIONAL_TEAM_ALIASES: Readonly<Record<string, string>> = Object.fromEntries(
  NATIONAL_TEAMS.flatMap((t) => (t.aliases ?? []).map((a) => [a, t.slug])),
);
