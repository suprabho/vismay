/**
 * Bundled team palette for fs:* modules. Maps slugs to display name, primary
 * brand color, a short monogram for the inline-SVG crest placeholder, and an
 * optional crest image URL.
 *
 * The monogram keeps a deterministic look in catalog previews, social-share
 * renders, and offline dev. When a `crest` URL is present it's used as the
 * real badge (with the monogram as the load-failure fallback — see Crest.tsx).
 * Crest URLs come from football-data.org, the same source the live Footshorts
 * worker seeds `entities.crest_url` from. Authors can still override per-fixture
 * via YAML (`homeColor`, `awayColor`, `homeCrestUrl`, `awayCrestUrl`).
 *
 * NOTE: the football-data.org team ids below are best-effort and should be
 * reconciled against the live `entities` table; a wrong id degrades to the
 * monogram (Crest.tsx handles the <img> onError), never a broken image.
 */

export interface TeamEntry {
  name: string
  /** Display name preferred for tight layouts (e.g. "Man City", "PSG"). Falls back to `name`. */
  shortName?: string
  /** Primary brand hex. Used for background fills + accents. */
  color: string
  /** Secondary brand hex, for two-tone treatments (text-on-color, stripes). */
  secondary: string
  /** 2–3 char monogram drawn into the crest placeholder. */
  monogram: string
  /** Optional crest image URL (football-data.org). Monogram is the fallback. */
  crest?: string
}

/** football-data.org public crest CDN. */
const fd = (id: number) => `https://crests.football-data.org/${id}.png`

/** flagcdn.com flag URL (CC0, same source as f1-viz) — national teams badge
 *  with their flag, not a crest; football-data.org serves national "crests"
 *  inconsistently (.svg only, some 404). Codes are ISO-3166-1 alpha-2 plus
 *  flagcdn's gb-eng/gb-sct/gb-wls subdivisions. */
const flag = (code: string) => `https://flagcdn.com/w320/${code}.png`

export const TEAMS: Record<string, TeamEntry> = {
  arsenal: { name: 'Arsenal', color: '#EF0107', secondary: '#FFFFFF', monogram: 'AFC', crest: fd(57) },
  chelsea: { name: 'Chelsea', color: '#034694', secondary: '#FFFFFF', monogram: 'CFC', crest: fd(61) },
  liverpool: { name: 'Liverpool', color: '#C8102E', secondary: '#F6EB61', monogram: 'LFC', crest: fd(64) },
  'manchester-city': {
    name: 'Manchester City',
    shortName: 'Man City',
    color: '#6CABDD',
    secondary: '#1C2C5B',
    monogram: 'MCI',
    crest: fd(65),
  },
  'manchester-united': {
    name: 'Manchester United',
    shortName: 'Man Utd',
    color: '#DA291C',
    secondary: '#FBE122',
    monogram: 'MUN',
    crest: fd(66),
  },
  tottenham: { name: 'Tottenham Hotspur', shortName: 'Tottenham', color: '#132257', secondary: '#FFFFFF', monogram: 'TOT', crest: fd(73) },
  'real-madrid': {
    name: 'Real Madrid',
    shortName: 'Madrid',
    color: '#FEBE10',
    secondary: '#00529F',
    monogram: 'RMA',
    crest: fd(86),
  },
  barcelona: { name: 'FC Barcelona', shortName: 'Barça', color: '#A50044', secondary: '#004D98', monogram: 'BAR', crest: fd(81) },
  'atletico-madrid': {
    name: 'Atlético Madrid',
    shortName: 'Atléti',
    color: '#CB3524',
    secondary: '#FFFFFF',
    monogram: 'ATM',
    crest: fd(78),
  },
  psg: { name: 'Paris Saint-Germain', shortName: 'PSG', color: '#004170', secondary: '#DA291C', monogram: 'PSG', crest: fd(524) },
  monaco: { name: 'AS Monaco', shortName: 'Monaco', color: '#CE3524', secondary: '#FFFFFF', monogram: 'ASM', crest: fd(548) },
  bayern: {
    name: 'Bayern Munich',
    shortName: 'Bayern',
    color: '#DC052D',
    secondary: '#0066B2',
    monogram: 'FCB',
    crest: fd(5),
  },
  leverkusen: { name: 'Bayer Leverkusen', shortName: 'Leverkusen', color: '#E32219', secondary: '#000000', monogram: 'B04', crest: fd(3) },
  dortmund: {
    name: 'Borussia Dortmund',
    shortName: 'Dortmund',
    color: '#FDE100',
    secondary: '#000000',
    monogram: 'BVB',
    crest: fd(4),
  },
  juventus: { name: 'Juventus', color: '#000000', secondary: '#FFFFFF', monogram: 'JUV', crest: fd(109) },
  inter: { name: 'Inter Milan', shortName: 'Inter', color: '#0068A8', secondary: '#000000', monogram: 'INT', crest: fd(108) },
  milan: { name: 'AC Milan', shortName: 'Milan', color: '#FB090B', secondary: '#000000', monogram: 'ACM', crest: fd(98) },
  napoli: { name: 'Napoli', color: '#12A0D7', secondary: '#FFFFFF', monogram: 'NAP', crest: fd(113) },
  atalanta: { name: 'Atalanta', color: '#1E71B8', secondary: '#000000', monogram: 'ATA', crest: fd(102) },
  newcastle: { name: 'Newcastle United', shortName: 'Newcastle', color: '#241F20', secondary: '#FFFFFF', monogram: 'NEW', crest: fd(67) },
  'aston-villa': { name: 'Aston Villa', shortName: 'Villa', color: '#670E36', secondary: '#95BFE5', monogram: 'AVL', crest: fd(58) },
  brighton: { name: 'Brighton & Hove Albion', shortName: 'Brighton', color: '#0057B8', secondary: '#FFFFFF', monogram: 'BHA', crest: fd(397) },
  brest: { name: 'Stade Brestois', shortName: 'Brest', color: '#E2001A', secondary: '#FFFFFF', monogram: 'BRE', crest: fd(512) },
  lille: { name: 'Lille', color: '#E01E13', secondary: '#FFFFFF', monogram: 'LIL', crest: fd(521) },
  ajax: { name: 'Ajax', color: '#D2122E', secondary: '#FFFFFF', monogram: 'AJX', crest: fd(678) },
  psv: { name: 'PSV Eindhoven', shortName: 'PSV', color: '#ED1C24', secondary: '#FFFFFF', monogram: 'PSV', crest: fd(674) },
  feyenoord: { name: 'Feyenoord', color: '#E20E0E', secondary: '#FFFFFF', monogram: 'FEY', crest: fd(675) },
  porto: { name: 'FC Porto', color: '#004A99', secondary: '#FFFFFF', monogram: 'POR', crest: fd(503) },
  benfica: { name: 'Benfica', color: '#E20020', secondary: '#FFFFFF', monogram: 'SLB', crest: fd(1903) },
  sporting: { name: 'Sporting CP', shortName: 'Sporting', color: '#008057', secondary: '#FFFFFF', monogram: 'SCP', crest: fd(498) },
  'club-brugge': { name: 'Club Brugge', shortName: 'Brugge', color: '#0066B3', secondary: '#000000', monogram: 'CLB', crest: fd(851) },
  celtic: { name: 'Celtic', color: '#018749', secondary: '#FFFFFF', monogram: 'CEL', crest: fd(732) },

  // National teams — badge is the country flag (flagcdn), monogram is the FIFA
  // trigram, colors are the primary kit / association palette.
  argentina: { name: 'Argentina', color: '#6CACE4', secondary: '#FFFFFF', monogram: 'ARG', crest: flag('ar') },
  france: { name: 'France', color: '#0055A4', secondary: '#FFFFFF', monogram: 'FRA', crest: flag('fr') },
  brazil: { name: 'Brazil', color: '#FFDC02', secondary: '#009739', monogram: 'BRA', crest: flag('br') },
  england: { name: 'England', color: '#001E44', secondary: '#FFFFFF', monogram: 'ENG', crest: flag('gb-eng') },
  spain: { name: 'Spain', color: '#AA151B', secondary: '#F1BF00', monogram: 'ESP', crest: flag('es') },
  germany: { name: 'Germany', color: '#000000', secondary: '#DD0000', monogram: 'GER', crest: flag('de') },
  portugal: { name: 'Portugal', color: '#DA291C', secondary: '#046A38', monogram: 'POR', crest: flag('pt') },
  netherlands: { name: 'Netherlands', color: '#F36C21', secondary: '#FFFFFF', monogram: 'NED', crest: flag('nl') },
  italy: { name: 'Italy', color: '#0066BC', secondary: '#FFFFFF', monogram: 'ITA', crest: flag('it') },
  belgium: { name: 'Belgium', color: '#E30613', secondary: '#FDDA24', monogram: 'BEL', crest: flag('be') },
  croatia: { name: 'Croatia', color: '#ED1C24', secondary: '#FFFFFF', monogram: 'CRO', crest: flag('hr') },
  uruguay: { name: 'Uruguay', color: '#55B5E5', secondary: '#FFFFFF', monogram: 'URU', crest: flag('uy') },
  mexico: { name: 'Mexico', color: '#006847', secondary: '#FFFFFF', monogram: 'MEX', crest: flag('mx') },
  'united-states': {
    name: 'United States',
    shortName: 'USA',
    color: '#002868',
    secondary: '#BF0A30',
    monogram: 'USA',
    crest: flag('us'),
  },
  japan: { name: 'Japan', color: '#13294B', secondary: '#FFFFFF', monogram: 'JPN', crest: flag('jp') },
  algeria: { name: 'Algeria', color: '#006233', secondary: '#FFFFFF', monogram: 'ALG', crest: flag('dz') },
  austria: { name: 'Austria', color: '#EF3340', secondary: '#FFFFFF', monogram: 'AUT', crest: flag('at') },
  jordan: { name: 'Jordan', color: '#CE1126', secondary: '#FFFFFF', monogram: 'JOR', crest: flag('jo') },
  morocco: { name: 'Morocco', color: '#C1272D', secondary: '#006233', monogram: 'MAR', crest: flag('ma') },
  canada: { name: 'Canada', color: '#FF0000', secondary: '#FFFFFF', monogram: 'CAN', crest: flag('ca') },
}

/**
 * Common non-canonical slugs/abbreviations → canonical `TEAMS` key. Hand-authored
 * demo data and some upstream feeds use short forms ("man-utd") that don't slugify
 * to the registry key ("manchester-united"); without this they'd silently degrade
 * to the monogram placeholder instead of the real crest. Keys must be in slugified
 * form (lowercase, hyphenated); values must be real `TEAMS` keys.
 */
const ALIASES: Record<string, string> = {
  'man-utd': 'manchester-united',
  'man-united': 'manchester-united',
  manutd: 'manchester-united',
  mufc: 'manchester-united',
  'man-city': 'manchester-city',
  mancity: 'manchester-city',
  mcfc: 'manchester-city',
  spurs: 'tottenham',
  'tottenham-hotspur': 'tottenham',
  barca: 'barcelona',
  'fc-barcelona': 'barcelona',
  atletico: 'atletico-madrid',
  atleti: 'atletico-madrid',
  villa: 'aston-villa',
  'bayern-munich': 'bayern',
  'borussia-dortmund': 'dortmund',
  bvb: 'dortmund',
  'inter-milan': 'inter',
  'ac-milan': 'milan',
  'paris-saint-germain': 'psg',
  brugge: 'club-brugge',
  usa: 'united-states',
  'united-states-of-america': 'united-states',
  holland: 'netherlands',
}

/** Slugify a display name so YAML can pass `home: "Arsenal"` and we still find the entry. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Lookup with display-name + alias fallback. Tries the raw key, then the
 * slugified form, then the alias map. Returns `null` if no bundled entry matches.
 */
export function findTeam(slugOrName: string): TeamEntry | null {
  const direct = TEAMS[slugOrName]
  if (direct) return direct
  const slug = slugify(slugOrName)
  if (TEAMS[slug]) return TEAMS[slug]
  const aliased = ALIASES[slug]
  return aliased ? TEAMS[aliased] ?? null : null
}

/** Resolve the display color for a team — YAML override wins, then bundled, then fallback. */
export function resolveTeamColor(slugOrName: string, override?: string): string {
  if (override) return override
  return findTeam(slugOrName)?.color ?? '#404040'
}

/** Bundled crest URL for a team (football-data.org), or undefined if we have none. */
export function teamCrestUrl(slugOrName: string): string | undefined {
  return findTeam(slugOrName)?.crest ?? undefined
}
