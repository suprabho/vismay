/**
 * Hand-curated surface forms the resolver should accept on top of what ESPN
 * gives us (display name, nickname, location, abbreviation). seedRoster.ts
 * writes these into the `aliases` column so the web app and admin can read
 * the same list; entityResolver.ts only ever reads the DB.
 *
 * Add an alias when the eval or an `[entity-miss]` log shows a real miss —
 * not speculatively. A short alias that collides with another entity is
 * worse than no alias: the resolver drops ambiguous keys entirely.
 */

/** team_id (ESPN abbreviation, lowercased) → extra names. */
export const TEAM_ALIASES: Record<string, string[]> = {
  atl: [],
  bos: ['Celts', "C's"],
  bkn: [],
  cha: [],
  chi: [],
  cle: ['Cavs'],
  dal: ['Mavs'],
  den: [],
  det: [],
  gs: ['Golden State', 'Dubs', 'GSW'],
  hou: [],
  ind: [],
  lac: ['LA Clippers', 'L.A. Clippers', 'Los Angeles Clippers', 'Clips'],
  lal: ['LA Lakers', 'L.A. Lakers'],
  mem: ['Grizz'],
  mia: [],
  mil: [],
  min: ['Wolves', 'T-Wolves', 'Minnesota Timberwolves'],
  no: ['Pels', 'NOP'],
  ny: ['NYK'],
  okc: ['OKC'],
  orl: [],
  phi: ['Sixers', 'Philadelphia Sixers', 'Philly', 'Philadelphia 76ers'],
  phx: [],
  por: ['Blazers', 'Portland Blazers'],
  sac: [],
  sa: ['SAS'],
  tor: [],
  utah: ['UTA'],
  wsh: ['WAS', 'Wiz'],
}

/**
 * Surface forms that point at more than one team. The resolver never maps
 * these, even when the seed would otherwise index them (ESPN's location for
 * the Clippers is "LA", for the Lakers "Los Angeles").
 */
export const AMBIGUOUS_TEAM_KEYS = ['LA', 'L.A.', 'Los Angeles', 'New York City']

/**
 * Player display name (as ESPN spells it) → nicknames the press actually
 * uses. Keyed by name rather than ESPN id so the list reads on its own;
 * seedRoster.ts matches it against the normalised display name. No need to
 * list suffix-less forms ("Jaren Jackson") or unique last names ("Embiid"):
 * the resolver derives both.
 */
export const PLAYER_ALIASES: Record<string, string[]> = {
  'LeBron James': ['LeBron', 'King James'],
  'Stephen Curry': ['Steph Curry', 'Steph'],
  'Kevin Durant': ['KD'],
  'Giannis Antetokounmpo': ['Giannis', 'Greek Freak'],
  'Shai Gilgeous-Alexander': ['SGA', 'Shai'],
  'Nikola Jokic': ['Joker'],
  'Luka Doncic': ['Luka'],
  'Victor Wembanyama': ['Wemby'],
  'Anthony Davis': ['AD'],
  'Karl-Anthony Towns': ['KAT'],
  'Anthony Edwards': ['Ant', 'Ant-Man'],
  'Jaren Jackson Jr.': ['JJJ', 'Triple J'],
  'Kawhi Leonard': ['Kawhi'],
  'Damian Lillard': ['Dame'],
  'Michael Porter Jr.': ['MPJ'],
  'Kentavious Caldwell-Pope': ['KCP'],
  'Cade Cunningham': ['Cade'],
}
