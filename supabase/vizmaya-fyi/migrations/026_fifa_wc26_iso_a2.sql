-- Add iso_a2 (ISO 3166-1 alpha-2) to fifa_wc26_teams so the /fifa-wc26 landing
-- page can join its 48 teams to Mapbox's `mapbox.country-boundaries-v1`
-- tileset, which keys polygons on `iso_3166_1` (alpha-2). The team `code`
-- column is FIFA 3-letter (ENG, GER, KSA, …) which won't match the tileset.
--
-- SCO (Scotland) shares the GB polygon with ENG (England); we let ENG own GB
-- and leave SCO as NULL so it isn't double-painted. SCO still surfaces in the
-- stories rail / team detail, just not on the choropleth.

alter table fifa_wc26_teams
  add column if not exists iso_a2 text;

-- Backfill from the canonical 48-team list. Source: scripts/fifa-wc26/import.ts.
update fifa_wc26_teams set iso_a2 = 'US' where code = 'USA';
update fifa_wc26_teams set iso_a2 = 'MX' where code = 'MEX';
update fifa_wc26_teams set iso_a2 = 'CA' where code = 'CAN';
update fifa_wc26_teams set iso_a2 = 'GB' where code = 'ENG';
update fifa_wc26_teams set iso_a2 = 'FR' where code = 'FRA';
update fifa_wc26_teams set iso_a2 = 'ES' where code = 'ESP';
update fifa_wc26_teams set iso_a2 = 'PT' where code = 'POR';
update fifa_wc26_teams set iso_a2 = 'DE' where code = 'GER';
update fifa_wc26_teams set iso_a2 = 'NL' where code = 'NED';
update fifa_wc26_teams set iso_a2 = 'BE' where code = 'BEL';
update fifa_wc26_teams set iso_a2 = 'HR' where code = 'CRO';
update fifa_wc26_teams set iso_a2 = 'TR' where code = 'TUR';
update fifa_wc26_teams set iso_a2 = 'CH' where code = 'SUI';
update fifa_wc26_teams set iso_a2 = 'NO' where code = 'NOR';
update fifa_wc26_teams set iso_a2 = 'SE' where code = 'SWE';
update fifa_wc26_teams set iso_a2 = 'AT' where code = 'AUT';
update fifa_wc26_teams set iso_a2 = 'CZ' where code = 'CZE';
-- SCO intentionally left NULL: ENG already claims GB.
update fifa_wc26_teams set iso_a2 = 'BA' where code = 'BIH';
update fifa_wc26_teams set iso_a2 = 'AR' where code = 'ARG';
update fifa_wc26_teams set iso_a2 = 'BR' where code = 'BRA';
update fifa_wc26_teams set iso_a2 = 'CO' where code = 'COL';
update fifa_wc26_teams set iso_a2 = 'UY' where code = 'URU';
update fifa_wc26_teams set iso_a2 = 'EC' where code = 'ECU';
update fifa_wc26_teams set iso_a2 = 'PY' where code = 'PAR';
update fifa_wc26_teams set iso_a2 = 'MA' where code = 'MAR';
update fifa_wc26_teams set iso_a2 = 'SN' where code = 'SEN';
update fifa_wc26_teams set iso_a2 = 'CI' where code = 'CIV';
update fifa_wc26_teams set iso_a2 = 'DZ' where code = 'ALG';
update fifa_wc26_teams set iso_a2 = 'GH' where code = 'GHA';
update fifa_wc26_teams set iso_a2 = 'EG' where code = 'EGY';
update fifa_wc26_teams set iso_a2 = 'TN' where code = 'TUN';
update fifa_wc26_teams set iso_a2 = 'ZA' where code = 'RSA';
update fifa_wc26_teams set iso_a2 = 'CV' where code = 'CPV';
update fifa_wc26_teams set iso_a2 = 'JP' where code = 'JPN';
update fifa_wc26_teams set iso_a2 = 'KR' where code = 'KOR';
update fifa_wc26_teams set iso_a2 = 'IR' where code = 'IRN';
update fifa_wc26_teams set iso_a2 = 'AU' where code = 'AUS';
update fifa_wc26_teams set iso_a2 = 'SA' where code = 'KSA';
update fifa_wc26_teams set iso_a2 = 'QA' where code = 'QAT';
update fifa_wc26_teams set iso_a2 = 'UZ' where code = 'UZB';
update fifa_wc26_teams set iso_a2 = 'JO' where code = 'JOR';
update fifa_wc26_teams set iso_a2 = 'PA' where code = 'PAN';
update fifa_wc26_teams set iso_a2 = 'HT' where code = 'HAI';
update fifa_wc26_teams set iso_a2 = 'CW' where code = 'CUW';
update fifa_wc26_teams set iso_a2 = 'NZ' where code = 'NZL';
update fifa_wc26_teams set iso_a2 = 'CD' where code = 'COD';
update fifa_wc26_teams set iso_a2 = 'IQ' where code = 'IRQ';

create unique index if not exists idx_fifa_wc26_teams_iso_a2
  on fifa_wc26_teams(iso_a2);
